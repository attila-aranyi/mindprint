// MindPrint — service worker.
// Dispatches headline batches to one of two engines:
//   - "tribe"  → POST to a user-supplied backend URL (TRIBE v2 on Modal)
//   - "claude" → direct to Anthropic Messages API with a user-supplied key
// Falls back to Claude if TRIBE is unreachable and fallbackToClaude is on.

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const CACHE_VERSION = 2; // bump when taxonomy or engines change
const MAX_BATCH = 20;
const MAX_HEADLINE_LEN = 300;
const TRIBE_TIMEOUT_MS = 300000; // 5 min — TRIBE processes each headline via TTS + inference

// Taxonomy — mirror of content.js / backend/taxonomy.py.
const TAXONOMY = {
  outrage:   { emoji: "😡", hint: "anger at a group, person, or policy" },
  fear:      { emoji: "😨", hint: "worry about a threat or danger" },
  curiosity: { emoji: "🤔", hint: "intrigue / clickbait mystery" },
  hope:      { emoji: "🌱", hint: "optimism, positive change" },
  sadness:   { emoji: "😢", hint: "empathy, grief, loss" },
  pride:     { emoji: "🦚", hint: "in-group affirmation, accomplishment" },
  amusement: { emoji: "😄", hint: "humor, lightness, entertainment" },
  disgust:   { emoji: "🤢", hint: "moral or physical revulsion" },
  neutral:   { emoji: "◽", hint: "informational, low emotional valence" },
};
const VALID_LABELS = Object.keys(TAXONOMY);

const CLAUDE_SYSTEM_PROMPT = `You analyze news headlines to identify the dominant emotional reaction each headline is engineered to provoke in a typical reader. This helps readers notice emotional framing in the news they consume.

You MUST choose exactly one label per headline from this fixed set:
- outrage: anger at a group, person, or policy
- fear: worry about a threat or danger
- curiosity: intrigue, clickbait mystery, "you won't believe..."
- hope: optimism, positive change, solutions
- sadness: empathy, grief, loss
- pride: in-group affirmation, accomplishment, patriotism
- amusement: humor, lightness, quirky entertainment
- disgust: moral or physical revulsion
- neutral: informational, low emotional valence

Focus on the *intended* reaction based on word choice, framing, and typical editorial patterns — not on the underlying event. A factual-sounding headline about a tragedy may still be engineered for sadness or fear.

Respond with ONLY a JSON array. No prose, no markdown fences. Each element:
{"id": <int>, "label": "<one of the labels above>", "confidence": <0.0-1.0>, "reasoning": "<<= 18 words>"}

The array length must equal the number of input headlines, in the same order.`;

const EXTRACT_SYSTEM_PROMPT = `You extract news/article headlines from a simplified HTML snippet of a webpage. The HTML contains headings (h1-h6), links (a), and structural tags.

Identify elements that are actual article/story headlines — not navigation labels, section headers, footer links, or UI text. A headline is a title of a news article, blog post, or story that a reader would click to read more.

Respond with ONLY a JSON array. No prose, no markdown fences. Each element:
{"text": "<exact headline text as it appears>"}

Return at most 50 headlines. If the page has no identifiable headlines, return an empty array [].`;

const EXTRACT_TIMEOUT_MS = 30000;
const MAX_EXTRACT_HEADLINES = 50;

const CLAUDE_ANALYSIS_MODEL = "claude-sonnet-4-5-20250514";
const ANALYSIS_TIMEOUT_MS = 60000;

const ANALYSIS_SYSTEM_PROMPT = `You are an expert media analyst. Given the HTML content of a news article or blog post, perform a structured analysis covering tone, factual claims, and logical reasoning.

Return ONLY a JSON object. No prose, no markdown fences. The object must have this exact structure:

{
  "tone": {
    "summary": "1-sentence description of the dominant rhetorical/emotional tone",
    "details": "2-3 sentences explaining the tone with specific language choices cited",
    "evidence": ["exact quote from article", "another exact quote"]
  },
  "fact_check": {
    "summary": "1-sentence overview, e.g. '4 claims identified, 1 unverifiable'",
    "claims": [
      {
        "claim": "The exact factual claim text from the article",
        "confidence": "high|medium|low|unverifiable",
        "reasoning": "1-2 sentences explaining your confidence rating"
      }
    ]
  },
  "fallacies": {
    "summary": "1-sentence overview, e.g. '1 fallacy detected' or 'No clear fallacies detected'",
    "items": [
      {
        "type": "Name of the fallacy",
        "quote": "The exact text from the article",
        "explanation": "1-2 sentences explaining why this is a fallacy"
      }
    ]
  },
  "overall_summary": "One paragraph synthesizing all findings — tone, factual reliability, reasoning quality."
}

Guidelines:
- For tone: focus on word choice, framing, and rhetorical techniques — not the topic itself.
- For fact_check: only flag verifiable factual claims (numbers, dates, attributions, statistics). Rate your confidence honestly. "unverifiable" means you cannot assess it from your training data — this is a valid and common rating.
- For fallacies: only flag clear logical fallacies with evidence. Rhetorical techniques (e.g. emotional language) belong in tone, not here. If no fallacies are found, return an empty items array.
- Keep evidence arrays to 2-4 items max.
- Keep claims array to 5-8 items max.`;

// ---------- settings ----------

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function getSettings() {
  const defaults = {
    engine: "tribe",            // "tribe" | "claude"
    backendUrl: "",             // e.g. https://user--mindprint-tribe-web.modal.run
    apiKey: "",                 // Anthropic key (used by claude engine + fallback)
    fallbackToClaude: false,    // if tribe errors and apiKey set, retry with claude
    enabled: true,
    analyzedToday: 0,
    analyzedDate: todayStr(),
  };
  const stored = await chrome.storage.local.get(Object.keys(defaults));
  return { ...defaults, ...stored };
}

async function bumpAnalyzedCounter(n) {
  const s = await getSettings();
  const date = todayStr();
  const count = s.analyzedDate === date ? s.analyzedToday + n : n;
  await chrome.storage.local.set({ analyzedToday: count, analyzedDate: date });
}

// ---------- cache ----------

function cacheKey(engine, headline) {
  return `c:${CACHE_VERSION}:${engine}:${headline}`;
}

async function readCache(engine, headlines) {
  const keys = headlines.map(h => cacheKey(engine, h));
  const got = await chrome.storage.local.get(keys);
  const hits = {};
  const misses = [];
  const now = Date.now();
  for (const h of headlines) {
    const v = got[cacheKey(engine, h)];
    if (v && v.ts && (now - v.ts) < CACHE_TTL_MS && VALID_LABELS.includes(v.label)) {
      hits[h] = v;
    } else {
      misses.push(h);
    }
  }
  return { hits, misses };
}

async function writeCache(engine, results) {
  const now = Date.now();
  const patch = {};
  for (const [headline, r] of Object.entries(results)) {
    patch[cacheKey(engine, headline)] = { ...r, ts: now };
  }
  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

async function clearCache() {
  const all = await chrome.storage.local.get(null);
  const toRemove = Object.keys(all).filter(k => k.startsWith("c:"));
  if (toRemove.length) await chrome.storage.local.remove(toRemove);
  return toRemove.length;
}

// ---------- helpers ----------

function truncate(s, n) { return s.length <= n ? s : s.slice(0, n - 1) + "…"; }

function normalizeLabel(label) {
  if (!label) return "neutral";
  const lc = String(label).toLowerCase().trim();
  return VALID_LABELS.includes(lc) ? lc : "neutral";
}

function parseModelJson(text) {
  let t = String(text || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON array in model output");
  return JSON.parse(t.slice(start, end + 1));
}

function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

// ---------- engine: TRIBE backend ----------

async function classifyBatchTribe(headlines, backendUrl) {
  if (!backendUrl) throw new Error("no_backend_url");
  const url = backendUrl.replace(/\/+$/, "") + "/classify";
  const resp = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ headlines }),
  }, TRIBE_TIMEOUT_MS);
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`tribe backend ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const out = {};
  const server = data.results || {};
  for (const h of headlines) {
    const r = server[h];
    if (!r) continue;
    const label = normalizeLabel(r.label);
    out[h] = {
      label,
      emoji: r.emoji || TAXONOMY[label].emoji,
      confidence: typeof r.confidence === "number" ? Math.max(0, Math.min(1, r.confidence)) : 0.5,
      reasoning: String(r.reasoning || "").slice(0, 240),
      top_regions: Array.isArray(r.top_regions) ? r.top_regions.slice(0, 3) : [],
      engine: "tribe",
    };
  }
  return out;
}

// ---------- engine: Claude ----------

async function classifyBatchClaude(headlines, apiKey) {
  if (!apiKey) throw new Error("no_api_key");
  const numbered = headlines.map((h, i) => `${i}. ${truncate(h, MAX_HEADLINE_LEN)}`).join("\n");
  const userMsg = `Classify the intended emotional reaction for each of these ${headlines.length} headlines. Respond with a JSON array of ${headlines.length} elements, in the same order.\n\n${numbered}`;

  const resp = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: CLAUDE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const arr = parseModelJson(text);
  const out = {};
  for (let i = 0; i < headlines.length; i++) {
    const item = arr.find(x => Number(x.id) === i) || arr[i] || {};
    const label = normalizeLabel(item.label);
    out[headlines[i]] = {
      label,
      emoji: TAXONOMY[label].emoji,
      confidence: typeof item.confidence === "number" ? Math.max(0, Math.min(1, item.confidence)) : 0.5,
      reasoning: String(item.reasoning || "").slice(0, 240),
      top_regions: [],
      engine: "claude",
    };
  }
  return out;
}

// ---------- headline extraction via Claude ----------

async function extractHeadlines(strippedHtml, apiKey) {
  if (!apiKey) throw new Error("no_api_key");
  const resp = await fetchWithTimeout(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Extract headlines from this page HTML:\n\n${strippedHtml}` }],
    }),
  }, EXTRACT_TIMEOUT_MS);
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const arr = parseModelJson(text);
  return arr
    .map(item => String(item.text || "").replace(/\s+/g, " ").trim())
    .filter(t => t.length >= 6 && t.length <= MAX_HEADLINE_LEN)
    .slice(0, MAX_EXTRACT_HEADLINES);
}

// ---------- article analysis via Claude ----------

async function analyzeArticleWithClaude(articleHtml, title, apiKey) {
  if (!apiKey) throw new Error("no_api_key");
  const userMsg = `Analyze this article titled "${title}":\n\n${articleHtml}`;

  const resp = await fetchWithTimeout(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: CLAUDE_ANALYSIS_MODEL,
      max_tokens: 4096,
      system: ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  }, ANALYSIS_TIMEOUT_MS);
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");

  // Parse JSON object (not array).
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in model output");
  return JSON.parse(t.slice(start, end + 1));
}

// ---------- analyze article orchestrator ----------

async function handleAnalyzeArticle(tabId) {
  const settings = await getSettings();
  if (!settings.enabled) return { ok: false, error: "disabled" };
  if (!settings.apiKey) return { ok: false, error: "no_api_key", message: "Set an Anthropic API key first." };

  function progress(step) {
    chrome.runtime.sendMessage({ type: "analyzeProgress", step }).catch(() => {});
  }

  // Step 1: Inject content script + CSS.
  progress("Preparing page...");
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["content.css"] });
  } catch (e) {
    return { ok: false, error: "inject_failed", message: `Cannot access this page: ${e.message}` };
  }

  // Step 2: Extract article content.
  progress("Extracting article...");
  let articleResp;
  try {
    articleResp = await chrome.tabs.sendMessage(tabId, { type: "extractArticle" });
  } catch (e) {
    return { ok: false, error: "extract_failed", message: `Article extraction failed: ${e.message}` };
  }
  if (!articleResp?.ok || !articleResp.html) {
    return { ok: false, error: "extract_empty", message: "No article content found on this page." };
  }

  const { title, imageUrl, html } = articleResp;

  // Step 3: Run TRIBE + Claude in parallel.
  progress("Analyzing tone and content...");

  const tribePromise = (settings.engine === "tribe" && settings.backendUrl)
    ? classifyBatchTribe([title], settings.backendUrl).catch(e => {
        console.warn("[MindPrint] TRIBE analysis failed:", e.message);
        return null;
      })
    : Promise.resolve(null);

  const claudePromise = analyzeArticleWithClaude(html, title, settings.apiKey);

  let tribeResult, claudeResult;
  try {
    [tribeResult, claudeResult] = await Promise.all([tribePromise, claudePromise]);
  } catch (e) {
    return { ok: false, error: "analysis_failed", message: `Analysis failed: ${e.message}` };
  }

  // Step 4: Merge results.
  const tribeData = tribeResult ? tribeResult[title] || Object.values(tribeResult)[0] || null : null;

  const analysisResults = {
    title,
    imageUrl,
    claude: claudeResult,
    tribe: tribeData,
    truncated: html.length >= 29900,
  };

  // Step 5: Inject banner.
  progress("Displaying results...");
  try {
    await chrome.tabs.sendMessage(tabId, { type: "injectBanner", analysis: analysisResults });
  } catch (e) {
    return { ok: false, error: "inject_banner_failed", message: `Banner injection failed: ${e.message}` };
  }

  await bumpAnalyzedCounter(1);
  return { ok: true, message: "Article analysis complete." };
}

// ---------- scan page orchestrator ----------

async function handleScanPage(tabId) {
  const settings = await getSettings();
  if (!settings.enabled) return { ok: false, error: "disabled" };
  if (!settings.apiKey) return { ok: false, error: "no_api_key", message: "Set an Anthropic API key first." };

  function progress(step) {
    chrome.runtime.sendMessage({ type: "scanProgress", step }).catch(() => {});
  }

  // Step 1: Inject content script + CSS into the tab.
  progress("Preparing page...");
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"],
    });
  } catch (e) {
    return { ok: false, error: "inject_failed", message: `Cannot access this page: ${e.message}` };
  }

  // Step 2: Extract stripped DOM.
  progress("Extracting page content...");
  let domResp;
  try {
    domResp = await chrome.tabs.sendMessage(tabId, { type: "extractDOM" });
  } catch (e) {
    return { ok: false, error: "extract_failed", message: `DOM extraction failed: ${e.message}` };
  }
  if (!domResp?.ok || !domResp.html) {
    return { ok: false, error: "extract_empty", message: "Could not extract page content." };
  }

  // Step 3: Ask Claude to identify headlines.
  progress("Identifying headlines...");
  let headlines;
  try {
    headlines = await extractHeadlines(domResp.html, settings.apiKey);
  } catch (e) {
    return { ok: false, error: "headline_extract_failed", message: `Headline extraction failed: ${e.message}` };
  }
  if (headlines.length === 0) {
    return { ok: true, count: 0, message: "No headlines found on this page." };
  }

  // Step 4+5: Classify in small batches and inject badges progressively.
  const SCAN_BATCH = 5;
  let totalClassified = 0;
  let totalDecorated = 0;
  let lastError = null;

  for (let i = 0; i < headlines.length; i += SCAN_BATCH) {
    const batch = headlines.slice(i, i + SCAN_BATCH);
    progress(`Classifying headlines ${i + 1}\u2013${Math.min(i + SCAN_BATCH, headlines.length)} of ${headlines.length}...`);

    const classifyResult = await handleClassify(batch);
    if (!classifyResult.ok) {
      lastError = classifyResult.error;
      continue; // skip failed batch, try the rest
    }
    totalClassified += Object.keys(classifyResult.results).length;

    // Inject badges for this batch immediately.
    try {
      const decorateResp = await chrome.tabs.sendMessage(tabId, {
        type: "decorate",
        results: classifyResult.results,
      });
      totalDecorated += decorateResp?.decorated || 0;
    } catch (e) {
      // Page may have navigated away — keep going so cache is warm for next scan.
    }
  }

  if (totalClassified === 0 && lastError) {
    return {
      ok: false,
      error: lastError,
      message: `Found ${headlines.length} headlines but classification failed: ${lastError}`,
      count: headlines.length,
    };
  }

  return {
    ok: true,
    count: headlines.length,
    classified: totalClassified,
    decorated: totalDecorated,
    message: `Analyzed ${totalClassified} of ${headlines.length} headlines, decorated ${totalDecorated}.`,
  };
}

// ---------- dispatch ----------

async function handleClassify(headlines) {
  const settings = await getSettings();
  if (!settings.enabled) return { ok: false, error: "disabled" };

  const seen = new Set();
  const clean = [];
  for (const h of headlines || []) {
    const t = String(h || "").replace(/\s+/g, " ").trim();
    if (t.length < 6 || t.length > MAX_HEADLINE_LEN) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    clean.push(t);
  }
  if (clean.length === 0) return { ok: true, results: {} };

  // Config-level errors short-circuit before hitting cache.
  if (settings.engine === "tribe" && !settings.backendUrl) {
    return { ok: false, error: "no_backend_url" };
  }
  if (settings.engine === "claude" && !settings.apiKey) {
    return { ok: false, error: "no_api_key" };
  }

  const { hits, misses } = await readCache(settings.engine, clean);
  const results = { ...hits };

  for (let i = 0; i < misses.length; i += MAX_BATCH) {
    const batch = misses.slice(i, i + MAX_BATCH);
    let batchResults;
    try {
      if (settings.engine === "tribe") {
        batchResults = await classifyBatchTribe(batch, settings.backendUrl);
      } else {
        batchResults = await classifyBatchClaude(batch, settings.apiKey);
      }
    } catch (e) {
      console.warn("[MindPrint] primary engine failed:", e.message || e);
      // Fallback to Claude if allowed and applicable.
      if (settings.engine === "tribe" && settings.fallbackToClaude && settings.apiKey) {
        try {
          batchResults = await classifyBatchClaude(batch, settings.apiKey);
        } catch (e2) {
          console.warn("[MindPrint] Claude fallback also failed:", e2.message || e2);
          return { ok: false, error: String(e2.message || e2), partial: results };
        }
      } else {
        return { ok: false, error: String(e.message || e), partial: results };
      }
    }
    Object.assign(results, batchResults);
    // Cache under the engine that produced the result (so switching engines recomputes).
    const firstResult = Object.values(batchResults)[0];
    const producedBy = firstResult?.engine || settings.engine;
    await writeCache(producedBy, batchResults);
    await bumpAnalyzedCounter(Object.keys(batchResults).length);
  }

  return { ok: true, results };
}

// ---------- message router ----------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "classify") {
        sendResponse(await handleClassify(msg.headlines));
      } else if (msg?.type === "scanPage") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ ok: false, error: "no_tab" }); return; }
        sendResponse(await handleScanPage(tab.id));
      } else if (msg?.type === "analyzeArticle") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ ok: false, error: "no_tab" }); return; }
        sendResponse(await handleAnalyzeArticle(tab.id));
      } else if (msg?.type === "getSettings") {
        sendResponse(await getSettings());
      } else if (msg?.type === "saveSettings") {
        await chrome.storage.local.set(msg.patch || {});
        sendResponse({ ok: true });
      } else if (msg?.type === "clearCache") {
        const n = await clearCache();
        sendResponse({ ok: true, cleared: n });
      } else if (msg?.type === "testBackend") {
        const url = (msg.url || "").replace(/\/+$/, "") + "/health";
        try {
          const r = await fetchWithTimeout(url, {}, 8000);
          sendResponse({ ok: r.ok, status: r.status });
        } catch (e) {
          sendResponse({ ok: false, error: String(e.message || e) });
        }
      } else if (msg?.type === "ping") {
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false, error: "unknown_message" });
      }
    } catch (e) {
      console.error("[MindPrint] handler error:", e);
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();
  return true;
});

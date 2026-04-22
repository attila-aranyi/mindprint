# Article Deep Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Analyze article" button that performs deep content analysis (tone, fact-check, logical fallacies, summary) using TRIBE + Claude in parallel, displaying results in a collapsible banner injected above the article.

**Architecture:** Popup sends `analyzeArticle` to background. Background injects content script, extracts article HTML, runs TRIBE tone analysis and Claude deep analysis in parallel, merges results, sends them to content script which builds and injects an accordion-style banner above the article.

**Tech Stack:** Chrome Extension MV3, Chrome Scripting API, Anthropic Messages API (Sonnet for analysis, Haiku for existing features), existing TRIBE backend.

---

### Task 1: Add "Analyze article" button to popup

**Files:**
- Modify: `popup.html`
- Modify: `popup.js`
- Modify: `popup.css`

- [ ] **Step 1: Add the button to popup.html**

In `popup.html`, replace the scan section (lines 54-57):

```html
  <section class="scan-section">
    <button id="scanPage" type="button" class="scan-btn">Scan this page</button>
    <div id="scanStatus" class="status"></div>
  </section>
```

With:

```html
  <section class="scan-section">
    <button id="scanPage" type="button" class="scan-btn">Scan this page</button>
    <div id="scanStatus" class="status"></div>
    <button id="analyzeArticle" type="button" class="analyze-btn secondary">Analyze article</button>
    <div id="analyzeStatus" class="status"></div>
  </section>
```

- [ ] **Step 2: Add element refs and handler to popup.js**

Add two new element references in the `els` object:

```js
  analyzeArticle: document.getElementById("analyzeArticle"),
  analyzeStatus: document.getElementById("analyzeStatus"),
```

Add the click handler before the `clearCache` handler:

```js
els.analyzeArticle.addEventListener("click", async () => {
  els.analyzeArticle.disabled = true;
  setStatus(els.analyzeStatus, "Analyzing article\u2026", "progress");
  try {
    const r = await send({ type: "analyzeArticle" });
    if (r?.ok) {
      setStatus(els.analyzeStatus, r.message || "Analysis complete.", "ok");
      const s = await send({ type: "getSettings" });
      els.today.textContent = `${s.analyzedToday || 0} analyzed today`;
    } else {
      setStatus(els.analyzeStatus, r?.message || r?.error || "Analysis failed.", "err");
    }
  } catch (e) {
    setStatus(els.analyzeStatus, `Error: ${e.message}`, "err");
  } finally {
    els.analyzeArticle.disabled = false;
  }
});
```

Update the progress listener to also handle `analyzeProgress`:

```js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "scanProgress" && els.scanPage.disabled) {
    setStatus(els.scanStatus, msg.step, "progress");
  }
  if (msg?.type === "analyzeProgress" && els.analyzeArticle.disabled) {
    setStatus(els.analyzeStatus, msg.step, "progress");
  }
});
```

- [ ] **Step 3: Add analyze button styles to popup.css**

Add after the `.scan-btn:disabled` rule:

```css
.analyze-btn {
  width: 100%;
  padding: 8px 14px;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
}

.analyze-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

- [ ] **Step 4: Commit**

```bash
git add popup.html popup.js popup.css
git commit -m "feat: add Analyze article button to popup"
```

---

### Task 2: Add extractArticle handler to content.js

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Add the extractArticle function and message handler**

Add the `extractArticle` function after the existing `extractDOM` function (after line 72):

```js
  // ---------- article extraction (deep analysis) ----------

  const MAX_ARTICLE_LEN = 30000;
  const ARTICLE_LEAF_TAGS = new Set([
    "H1", "H2", "H3", "H4", "H5", "H6", "P", "BLOCKQUOTE",
    "LI", "FIGCAPTION", "PRE", "CODE", "EM", "STRONG", "A",
  ]);

  function extractArticle() {
    const root = document.querySelector("article")
      || document.querySelector('[role="main"]')
      || document.querySelector("main")
      || document.body;

    // Extract title.
    const h1 = document.querySelector("h1");
    const title = h1 ? h1.textContent.replace(/\s+/g, " ").trim() : document.title;

    // Extract main image URL.
    const img = root.querySelector("img[src]");
    const imageUrl = img ? img.src : null;

    // Extract stripped article HTML.
    const parts = [];
    let totalLen = 0;

    function walk(el) {
      if (!el || !el.tagName) return;
      if (totalLen >= MAX_ARTICLE_LEN) return;
      const tag = el.tagName;

      if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "NOSCRIPT"
          || tag === "IFRAME" || tag === "NAV" || tag === "FOOTER") return;

      const isLeaf = ARTICLE_LEAF_TAGS.has(tag);

      if (isLeaf) {
        const text = el.textContent.replace(/\s+/g, " ").trim();
        if (text.length < 2) return;
        const openTag = tag === "A" && el.href
          ? `<${tag.toLowerCase()} href="${el.getAttribute("href")}">`
          : `<${tag.toLowerCase()}>`;
        const line = `${openTag}${text}</${tag.toLowerCase()}>`;
        parts.push(line);
        totalLen += line.length + 1;
        // For inline tags (EM, STRONG, A, CODE) don't return — parent P will also be captured.
        // For block tags, don't recurse.
        if (tag !== "EM" && tag !== "STRONG" && tag !== "CODE") return;
      }

      for (const child of el.children) {
        if (totalLen >= MAX_ARTICLE_LEN) break;
        walk(child);
      }
    }

    walk(root);
    const html = parts.join("\n").slice(0, MAX_ARTICLE_LEN);
    return { title, imageUrl, html };
  }
```

Add the `extractArticle` message handler inside the existing `chrome.runtime.onMessage.addListener` callback, after the `decorate` handler:

```js
    } else if (msg?.type === "extractArticle") {
      sendResponse({ ok: true, ...extractArticle() });
```

- [ ] **Step 2: Commit**

```bash
git add content.js
git commit -m "feat: add extractArticle handler for deep article analysis"
```

---

### Task 3: Add Claude analysis prompt and function to background.js

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add the analysis model constant and system prompt**

Add after the `MAX_EXTRACT_HEADLINES` constant (line 59):

```js
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
```

- [ ] **Step 2: Add the analyzeArticleWithClaude function**

Add after the `extractHeadlines` function:

```js
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
```

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: add Claude article analysis prompt and function"
```

---

### Task 4: Add handleAnalyzeArticle orchestrator to background.js

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add the orchestrator function**

Add after `analyzeArticleWithClaude`:

```js
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
```

- [ ] **Step 2: Add the message handler**

In the `chrome.runtime.onMessage.addListener` block, add after the `scanPage` handler:

```js
      } else if (msg?.type === "analyzeArticle") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ ok: false, error: "no_tab" }); return; }
        sendResponse(await handleAnalyzeArticle(tab.id));
```

- [ ] **Step 3: Commit**

```bash
git add background.js
git commit -m "feat: add handleAnalyzeArticle orchestrator with parallel TRIBE + Claude"
```

---

### Task 5: Add banner injection to content.js

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Add the banner builder and inject handler**

Add before the message listener (before the `chrome.runtime.onMessage.addListener` line):

```js
  // ---------- analysis banner ----------

  const CONF_COLORS = { high: "conf-high", medium: "conf-med", low: "conf-low", unverifiable: "conf-unv" };

  function buildBanner(analysis) {
    // Remove existing banner.
    const existing = document.querySelector(".mindprint-banner");
    if (existing) existing.remove();

    const { claude, tribe, truncated } = analysis;
    const banner = document.createElement("div");
    banner.className = "mindprint-banner";

    // Header bar.
    const header = document.createElement("div");
    header.className = "mpb-header";

    const label = document.createElement("span");
    label.className = "mpb-label";
    label.textContent = "MindPrint Analysis";

    const pills = document.createElement("span");
    pills.className = "mpb-pills";

    if (claude.tone?.summary) {
      const pill = document.createElement("span");
      pill.className = "mpb-pill mpb-pill-tone";
      pill.textContent = claude.tone.summary;
      pill.addEventListener("click", () => toggleSection(banner, "tone"));
      pills.appendChild(pill);
    }
    if (claude.fact_check?.summary) {
      const pill = document.createElement("span");
      pill.className = "mpb-pill mpb-pill-fact";
      pill.textContent = claude.fact_check.summary;
      pill.addEventListener("click", () => toggleSection(banner, "factcheck"));
      pills.appendChild(pill);
    }
    if (claude.fallacies?.summary) {
      const pill = document.createElement("span");
      pill.className = "mpb-pill mpb-pill-fallacy";
      pill.textContent = claude.fallacies.summary;
      pill.addEventListener("click", () => toggleSection(banner, "fallacies"));
      pills.appendChild(pill);
    }

    const dismiss = document.createElement("button");
    dismiss.className = "mpb-dismiss";
    dismiss.textContent = "\u00D7";
    dismiss.title = "Dismiss";
    dismiss.addEventListener("click", () => banner.remove());

    header.append(label, pills, dismiss);
    banner.appendChild(header);

    // Tone section.
    const toneSection = buildSection("tone", "Tone", () => {
      const frag = document.createDocumentFragment();
      const p = document.createElement("p");
      p.textContent = claude.tone?.details || claude.tone?.summary || "";
      frag.appendChild(p);
      if (claude.tone?.evidence?.length) {
        for (const q of claude.tone.evidence) {
          const bq = document.createElement("blockquote");
          bq.className = "mpb-quote";
          bq.textContent = q;
          frag.appendChild(bq);
        }
      }
      if (tribe) {
        const sub = document.createElement("div");
        sub.className = "mpb-tribe-sub";
        const tLabel = document.createElement("strong");
        tLabel.textContent = `TRIBE v2: ${tribe.emoji || ""} ${tribe.label || "unknown"} (${Math.round((tribe.confidence || 0) * 100)}%)`;
        sub.appendChild(tLabel);
        if (tribe.top_regions?.length) {
          const regions = document.createElement("span");
          regions.className = "mpb-regions";
          regions.textContent = " \u2014 " + tribe.top_regions.map(r => `${r.roi} (${r.contribution.toFixed(2)})`).join(", ");
          sub.appendChild(regions);
        }
        if (tribe.reasoning) {
          const rp = document.createElement("p");
          rp.className = "mpb-tribe-reasoning";
          rp.textContent = tribe.reasoning;
          sub.appendChild(rp);
        }
        frag.appendChild(sub);
      }
      return frag;
    });
    banner.appendChild(toneSection);

    // Fact-check section.
    const factSection = buildSection("factcheck", "Fact Check", () => {
      const frag = document.createDocumentFragment();
      const claims = claude.fact_check?.claims || [];
      if (claims.length === 0) {
        const p = document.createElement("p");
        p.textContent = "No verifiable claims identified.";
        frag.appendChild(p);
        return frag;
      }
      for (const claim of claims) {
        const card = document.createElement("div");
        card.className = "mpb-claim-card";
        const badge = document.createElement("span");
        badge.className = `mpb-conf-badge ${CONF_COLORS[claim.confidence] || "conf-med"}`;
        badge.textContent = claim.confidence || "medium";
        const text = document.createElement("span");
        text.className = "mpb-claim-text";
        text.textContent = claim.claim;
        const reason = document.createElement("p");
        reason.className = "mpb-claim-reason";
        reason.textContent = claim.reasoning || "";
        card.append(badge, text, reason);
        frag.appendChild(card);
      }
      return frag;
    });
    banner.appendChild(factSection);

    // Fallacies section.
    const fallacySection = buildSection("fallacies", "Logical Fallacies", () => {
      const frag = document.createDocumentFragment();
      const items = claude.fallacies?.items || [];
      if (items.length === 0) {
        const p = document.createElement("p");
        p.textContent = "No clear logical fallacies detected.";
        frag.appendChild(p);
        return frag;
      }
      for (const item of items) {
        const card = document.createElement("div");
        card.className = "mpb-fallacy-card";
        const typeEl = document.createElement("strong");
        typeEl.textContent = item.type || "Unknown";
        const bq = document.createElement("blockquote");
        bq.className = "mpb-quote";
        bq.textContent = item.quote || "";
        const expl = document.createElement("p");
        expl.textContent = item.explanation || "";
        card.append(typeEl, bq, expl);
        frag.appendChild(card);
      }
      return frag;
    });
    banner.appendChild(fallacySection);

    // Overall summary section.
    const summarySection = buildSection("summary", "Summary", () => {
      const frag = document.createDocumentFragment();
      const p = document.createElement("p");
      p.textContent = claude.overall_summary || "";
      frag.appendChild(p);
      if (truncated) {
        const note = document.createElement("p");
        note.className = "mpb-note";
        note.textContent = "Note: article was truncated for analysis.";
        frag.appendChild(note);
      }
      return frag;
    });
    banner.appendChild(summarySection);

    return banner;
  }

  function buildSection(id, label, contentBuilder) {
    const section = document.createElement("div");
    section.className = "mpb-section";
    section.dataset.section = id;

    const header = document.createElement("div");
    header.className = "mpb-section-header";
    header.textContent = label;
    header.addEventListener("click", () => {
      const parent = section.closest(".mindprint-banner");
      if (parent) toggleSection(parent, id);
    });

    const body = document.createElement("div");
    body.className = "mpb-section-body";
    body.style.display = "none";
    body.appendChild(contentBuilder());

    section.append(header, body);
    return section;
  }

  function toggleSection(banner, sectionId) {
    const sections = banner.querySelectorAll(".mpb-section");
    for (const s of sections) {
      const body = s.querySelector(".mpb-section-body");
      if (!body) continue;
      if (s.dataset.section === sectionId) {
        const isOpen = body.style.display !== "none";
        body.style.display = isOpen ? "none" : "block";
        s.classList.toggle("mpb-open", !isOpen);
      } else {
        body.style.display = "none";
        s.classList.remove("mpb-open");
      }
    }
  }
```

Add the `injectBanner` and `removeBanner` message handlers inside the existing listener, after the `extractArticle` handler:

```js
    } else if (msg?.type === "injectBanner") {
      const root = document.querySelector("article")
        || document.querySelector('[role="main"]')
        || document.querySelector("main")
        || document.body;
      const banner = buildBanner(msg.analysis);
      root.insertBefore(banner, root.firstChild);
      sendResponse({ ok: true });
    } else if (msg?.type === "removeBanner") {
      const existing = document.querySelector(".mindprint-banner");
      if (existing) existing.remove();
      sendResponse({ ok: true });
```

- [ ] **Step 2: Commit**

```bash
git add content.js
git commit -m "feat: add analysis banner builder and injection to content script"
```

---

### Task 6: Add banner CSS to content.css

**Files:**
- Modify: `content.css`

- [ ] **Step 1: Append banner styles to content.css**

Add at the end of `content.css`:

```css
/* ---------- Analysis banner ---------- */

.mindprint-banner {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  color: #1f2328;
  background: #f8f9fb;
  border: 1px solid #d0d4dc;
  border-radius: 10px;
  margin: 16px 0;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  line-height: 1.5;
}

.mpb-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #eef0f4;
  border-bottom: 1px solid #d0d4dc;
  flex-wrap: wrap;
}

.mpb-label {
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
}

.mpb-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.mpb-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: filter 0.1s;
}
.mpb-pill:hover { filter: brightness(0.93); }

.mpb-pill-tone    { background: #e3f0ff; border: 1px solid #a7c8f1; color: #1b4b9a; }
.mpb-pill-fact    { background: #fff4d6; border: 1px solid #e5c97a; color: #7a5b10; }
.mpb-pill-fallacy { background: #ffe4e1; border: 1px solid #f3aaa0; color: #9a1b1b; }

.mpb-dismiss {
  margin-left: auto;
  background: transparent;
  border: none;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: #5b636d;
  padding: 0 4px;
}
.mpb-dismiss:hover { color: #1f2328; }

.mpb-section { border-bottom: 1px solid #e1e4e8; }
.mpb-section:last-child { border-bottom: none; }

.mpb-section-header {
  padding: 10px 14px;
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #5b636d;
  cursor: pointer;
  user-select: none;
  position: relative;
}
.mpb-section-header::after {
  content: "\25B6";
  position: absolute;
  right: 14px;
  font-size: 10px;
  transition: transform 0.15s;
}
.mpb-open .mpb-section-header::after {
  transform: rotate(90deg);
}

.mpb-section-body {
  padding: 0 14px 12px;
}

.mpb-section-body p {
  margin: 0 0 8px;
  font-size: 13px;
}

.mpb-quote {
  margin: 6px 0;
  padding: 6px 12px;
  border-left: 3px solid #a7c8f1;
  background: rgba(163, 200, 241, 0.1);
  font-style: italic;
  font-size: 12px;
  color: #3a4a5b;
}

.mpb-tribe-sub {
  margin-top: 10px;
  padding: 8px 12px;
  background: rgba(107, 140, 255, 0.08);
  border-radius: 6px;
  font-size: 12px;
}

.mpb-regions { color: #5b636d; font-size: 11px; }

.mpb-tribe-reasoning { font-size: 12px; color: #5b636d; margin-top: 4px; }

.mpb-claim-card {
  padding: 8px 0;
  border-bottom: 1px solid #e1e4e8;
}
.mpb-claim-card:last-child { border-bottom: none; }

.mpb-conf-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  margin-right: 8px;
  vertical-align: middle;
}
.conf-high { background: #e2f6e6; color: #1d6b2d; }
.conf-med  { background: #fff4d6; color: #7a5b10; }
.conf-low  { background: #ffe4e1; color: #9a1b1b; }
.conf-unv  { background: #e6ecf2; color: #2c4b66; }

.mpb-claim-text { font-size: 13px; font-weight: 500; }

.mpb-claim-reason { font-size: 12px; color: #5b636d; margin: 4px 0 0; }

.mpb-fallacy-card {
  padding: 8px 0;
  border-bottom: 1px solid #e1e4e8;
}
.mpb-fallacy-card:last-child { border-bottom: none; }

.mpb-note {
  font-size: 11px;
  color: #5b636d;
  font-style: italic;
}

/* ---------- Banner dark mode ---------- */

@media (prefers-color-scheme: dark) {
  .mindprint-banner {
    color: #e6e8eb;
    background: #1a1e24;
    border-color: #3b424d;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
  .mpb-header {
    background: #22272e;
    border-bottom-color: #3b424d;
  }
  .mpb-pill-tone    { background: #1b2e4a; border-color: #2e4a7a; color: #c6d9ff; }
  .mpb-pill-fact    { background: #4a3a12; border-color: #7a5f21; color: #ffe2a1; }
  .mpb-pill-fallacy { background: #4a1f1b; border-color: #7a2e27; color: #ffc6bf; }
  .mpb-dismiss { color: #a0a6ad; }
  .mpb-dismiss:hover { color: #e6e8eb; }
  .mpb-section { border-bottom-color: #2a2f37; }
  .mpb-section-header { color: #a0a6ad; }
  .mpb-quote {
    border-left-color: #2e4a7a;
    background: rgba(46, 74, 122, 0.15);
    color: #a0b4cc;
  }
  .mpb-tribe-sub { background: rgba(107, 140, 255, 0.1); }
  .mpb-regions { color: #a0a6ad; }
  .mpb-tribe-reasoning { color: #a0a6ad; }
  .mpb-claim-card { border-bottom-color: #2a2f37; }
  .conf-high { background: #1e3f22; color: #bfe6c6; }
  .conf-med  { background: #4a3a12; color: #ffe2a1; }
  .conf-low  { background: #4a1f1b; color: #ffc6bf; }
  .conf-unv  { background: #26343f; color: #c6d4e0; }
  .mpb-claim-reason { color: #a0a6ad; }
  .mpb-fallacy-card { border-bottom-color: #2a2f37; }
  .mpb-note { color: #a0a6ad; }
}
```

- [ ] **Step 2: Commit**

```bash
git add content.css
git commit -m "feat: add analysis banner styles with dark mode support"
```

---

### Task 7: End-to-end manual test

- [ ] **Step 1: Reload extension**

Go to `chrome://extensions`, click the refresh icon on MindPrint.

- [ ] **Step 2: Verify popup renders both buttons**

Click the MindPrint icon. Confirm:
- "Scan this page" button is present (primary style)
- "Analyze article" button is present below it (secondary style)

- [ ] **Step 3: Test article analysis on a news article**

1. Navigate to a BBC article page (click into any article from `bbc.com`)
2. Click MindPrint icon
3. Click "Analyze article"
4. Confirm progress messages appear: "Extracting article...", "Analyzing tone and content...", "Displaying results..."
5. Confirm a banner appears above the article with:
   - Header bar with tone/fact-check/fallacy pills
   - Clickable section headers that expand/collapse as accordions
   - If TRIBE is configured: TRIBE data sub-section under Tone

- [ ] **Step 4: Test on a page with no article**

1. Navigate to `https://example.com`
2. Click "Analyze article"
3. Confirm it shows an appropriate message (may show minimal analysis since the page has little content)

- [ ] **Step 5: Test dismiss**

1. On the article page with banner visible, click the X button
2. Confirm banner is removed
3. Click "Analyze article" again — confirm banner re-appears

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: MindPrint article deep analysis — tone, fact-check, fallacies, summary"
```

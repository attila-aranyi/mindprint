# Social Media Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add platform-specific extractors for X and Instagram, expand the analysis prompt to detect engagement tactics and missing context, rename the button to "Analyze", and add two new sidebar sections.

**Architecture:** Content script detects hostname and routes to the correct extractor (X, Instagram, or generic article). Background builds a platform-aware Claude prompt that includes engagement/context detection. Banner gains two new accordion sections plus a metadata line for social posts.

**Tech Stack:** Chrome Extension MV3, Anthropic Messages API (Claude Sonnet), existing TRIBE backend.

---

### Task 1: Rename button and message types

**Files:**
- Modify: `popup.html`
- Modify: `popup.js`
- Modify: `background.js`

- [ ] **Step 1: Rename button in popup.html**

Change line 57:
```html
    <button id="analyzeArticle" type="button" class="analyze-btn secondary">Analyze article</button>
```
To:
```html
    <button id="analyzeContent" type="button" class="analyze-btn secondary">Analyze</button>
```

- [ ] **Step 2: Update popup.js element refs and handler**

Change the element ref (line 18):
```js
  analyzeArticle: document.getElementById("analyzeArticle"),
```
To:
```js
  analyzeContent: document.getElementById("analyzeContent"),
```

Update all references from `els.analyzeArticle` to `els.analyzeContent` (3 occurrences in the click handler, 1 in the progress listener).

Change the message type in the click handler from `"analyzeArticle"` to `"analyzeContent"`.

- [ ] **Step 3: Update background.js message router**

Change the message handler (line 594):
```js
      } else if (msg?.type === "analyzeArticle") {
```
To:
```js
      } else if (msg?.type === "analyzeContent") {
```

Rename `handleAnalyzeArticle` to `handleAnalyzeContent` (function definition at line 350 and call at line 597).

- [ ] **Step 4: Commit**

```bash
git add popup.html popup.js background.js
git commit -m "refactor: rename Analyze article to Analyze, update message types"
```

---

### Task 2: Add X and Instagram extractors to content.js

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Add platform detection and extractors**

Add this block after the `extractArticle` function (after line 131), before `// ---------- headline node finding ----------`:

```js
  // ---------- platform-specific extractors ----------

  function detectPlatform() {
    const host = location.hostname;
    if (host === "x.com" || host === "twitter.com") return "x";
    if (host === "www.instagram.com" || host === "instagram.com") return "instagram";
    return "article";
  }

  function extractXPost() {
    const tweetText = document.querySelector('[data-testid="tweetText"]');
    const text = tweetText ? tweetText.textContent.replace(/\s+/g, " ").trim() : "";

    // Author info.
    const userNameEl = document.querySelector('[data-testid="User-Name"]');
    let authorName = "", authorHandle = "", verified = false;
    if (userNameEl) {
      const spans = userNameEl.querySelectorAll("span");
      for (const s of spans) {
        const t = s.textContent.trim();
        if (t.startsWith("@")) authorHandle = t;
        else if (t.length > 1 && !t.startsWith("@") && !authorName) authorName = t;
      }
      verified = !!userNameEl.querySelector('svg[aria-label*="Verified"], svg[data-testid="icon-verified"]');
    }

    // Timestamp.
    const timeEl = document.querySelector('article time[datetime]');
    const timestamp = timeEl ? timeEl.getAttribute("datetime") : null;

    // Engagement counts.
    const engagement = { likes: 0, retweets: 0, replies: 0, views: 0 };
    const groups = document.querySelectorAll('[role="group"] button[data-testid]');
    for (const btn of groups) {
      const tid = btn.getAttribute("data-testid") || "";
      const num = parseInt((btn.textContent.match(/[\d,.]+[KMB]?/) || ["0"])[0].replace(/,/g, ""), 10) || 0;
      if (tid.includes("reply")) engagement.replies = num;
      else if (tid.includes("retweet")) engagement.retweets = num;
      else if (tid.includes("like")) engagement.likes = num;
    }
    const viewEl = document.querySelector('a[href*="/analytics"]');
    if (viewEl) {
      const vt = viewEl.textContent.replace(/,/g, "").match(/[\d]+/);
      if (vt) engagement.views = parseInt(vt[0], 10) || 0;
    }

    // Quoted tweet.
    const quotedEl = document.querySelector('[data-testid="quoteTweet"] [data-testid="tweetText"]');
    const quotedText = quotedEl ? quotedEl.textContent.replace(/\s+/g, " ").trim() : null;

    // Media.
    const hasMedia = !!document.querySelector('article [data-testid="tweetPhoto"], article video');

    const title = `${authorName} ${authorHandle}`;
    const html = `<p>${text}</p>` + (quotedText ? `<blockquote>${quotedText}</blockquote>` : "");

    return {
      platform: "x",
      title,
      author: { name: authorName, handle: authorHandle, verified },
      timestamp,
      engagement,
      quotedText,
      hasMedia,
      html,
    };
  }

  function extractInstagramPost() {
    // Caption — try multiple selectors as Instagram's DOM varies.
    let captionText = "";
    const captionEl = document.querySelector('h1')
      || document.querySelector('[data-testid="post-comment-root"] span')
      || document.querySelector('div[role="dialog"] ul li span');
    if (captionEl) captionText = captionEl.textContent.replace(/\s+/g, " ").trim();

    // Author.
    let authorName = "", verified = false;
    const authorLink = document.querySelector('header a[role="link"]')
      || document.querySelector('a[href*="/"]:has(img[alt])');
    if (authorLink) {
      authorName = authorLink.textContent.replace(/\s+/g, " ").trim();
      const headerEl = authorLink.closest("header") || authorLink.parentElement;
      if (headerEl) {
        verified = !!headerEl.querySelector('svg[aria-label*="Verified"], span[title="Verified"]');
      }
    }

    // Engagement.
    const engagement = { likes: 0, comments: 0 };
    const likeEl = document.querySelector('section a[href*="liked_by"], section span');
    if (likeEl) {
      const likeMatch = likeEl.textContent.replace(/,/g, "").match(/([\d]+)/);
      if (likeMatch) engagement.likes = parseInt(likeMatch[1], 10) || 0;
    }
    const commentEls = document.querySelectorAll('ul > li[role="menuitem"], ul > div > li');
    engagement.comments = Math.max(0, commentEls.length - 1); // subtract caption "comment"

    // Hashtags.
    const hashtags = [];
    const hashMatches = captionText.match(/#\w+/g);
    if (hashMatches) hashtags.push(...hashMatches.map(h => h.slice(1)));

    // Media type.
    let mediaType = "image";
    if (document.querySelector('video')) mediaType = "reel";
    else if (document.querySelectorAll('li[style*="translateX"]').length > 1) mediaType = "carousel";

    const title = `${authorName} post`;
    const html = `<p>${captionText}</p>`;

    return {
      platform: "instagram",
      title,
      author: { name: authorName, verified },
      engagement,
      hashtags,
      mediaType,
      html,
    };
  }

  function extractContent() {
    const platform = detectPlatform();
    if (platform === "x") return extractXPost();
    if (platform === "instagram") return extractInstagramPost();
    return { platform: "article", ...extractArticle() };
  }
```

- [ ] **Step 2: Update the extractArticle message handler**

Change the handler (around line 412):
```js
    } else if (msg?.type === "extractArticle") {
      sendResponse({ ok: true, ...extractArticle() });
```
To:
```js
    } else if (msg?.type === "extractContent") {
      sendResponse({ ok: true, ...extractContent() });
```

- [ ] **Step 3: Commit**

```bash
git add content.js
git commit -m "feat: add X and Instagram extractors with platform detection"
```

---

### Task 3: Build platform-aware analysis prompt in background.js

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Replace the static ANALYSIS_SYSTEM_PROMPT with a builder function**

Replace the `ANALYSIS_SYSTEM_PROMPT` constant (lines 64-102) with:

```js
function buildAnalysisPrompt(platform, metadata) {
  const baseAnalysis = `You are an expert media analyst. Analyze the following content and return ONLY a JSON object. No prose, no markdown fences.

The JSON must have this structure:

{
  "tone": {
    "summary": "1-sentence description of the dominant rhetorical/emotional tone",
    "details": "2-3 sentences explaining the tone with specific language choices cited",
    "evidence": ["exact quote 1", "exact quote 2"]
  },
  "fact_check": {
    "summary": "1-sentence overview, e.g. '4 claims identified, 1 unverifiable'",
    "claims": [
      {
        "claim": "The exact factual claim text",
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
        "quote": "The exact text",
        "explanation": "1-2 sentences explaining why"
      }
    ]
  },
  "engagement_tactics": {
    "summary": "1-sentence overview, e.g. '2 engagement tactics detected' or 'No engagement tactics detected'",
    "items": [
      {
        "type": "Tactic name",
        "quote": "exact text",
        "explanation": "Why this is an engagement tactic"
      }
    ]
  },
  "missing_context": {
    "summary": "1-sentence overview, e.g. '2 context gaps identified' or 'No significant context gaps'",
    "items": [
      {
        "type": "Type of missing context",
        "detail": "What context is missing and why it matters",
        "severity": "high|medium|low"
      }
    ]
  },
  "overall_summary": "One paragraph synthesizing all findings."
}`;

  const guidelines = `
Guidelines:
- tone: focus on word choice, framing, and rhetorical techniques.
- fact_check: only flag verifiable factual claims. Rate confidence honestly. "unverifiable" is valid and common. Max 5-8 claims.
- fallacies: only flag clear logical fallacies with evidence. Rhetorical techniques belong in tone. Empty items array if none found.
- engagement_tactics: detect rage bait, cliffhangers, false controversies, call-to-action manipulation ("share if you agree"), urgency cues ("BREAKING"), ALL CAPS / excessive punctuation, hyperbolic language. Empty items array if none found.
- missing_context: detect missing sources, old content without dates, selective framing, unattributed quotes/screenshots, hedging language, unverified claims stated as fact. Empty items array if none found.
- Keep evidence arrays to 2-4 items max.`;

  let platformContext = "";
  if (platform === "x" && metadata) {
    const m = metadata;
    const parts = [];
    if (m.author?.name) parts.push(`Author: ${m.author.name} ${m.author.handle || ""} (${m.author.verified ? "verified" : "unverified"})`);
    if (m.timestamp) parts.push(`Posted: ${m.timestamp}`);
    if (m.engagement) parts.push(`Engagement: ${m.engagement.likes} likes, ${m.engagement.retweets} retweets, ${m.engagement.replies} replies, ${m.engagement.views} views`);
    if (m.hasMedia) parts.push("Contains media (image/video)");
    if (m.quotedText) parts.push(`Quotes another post: "${m.quotedText}"`);
    platformContext = `\n\nThis is a post on X (Twitter). Consider source credibility based on verification status and engagement patterns.\nMetadata:\n${parts.join("\n")}`;
  } else if (platform === "instagram" && metadata) {
    const m = metadata;
    const parts = [];
    if (m.author?.name) parts.push(`Author: ${m.author.name} (${m.author.verified ? "verified" : "unverified"})`);
    if (m.engagement) parts.push(`Engagement: ${m.engagement.likes} likes, ${m.engagement.comments} comments`);
    if (m.hashtags?.length) parts.push(`Hashtags: ${m.hashtags.map(h => "#" + h).join(" ")}`);
    if (m.mediaType) parts.push(`Media type: ${m.mediaType}`);
    platformContext = `\n\nThis is an Instagram post. Consider source credibility and how hashtags/engagement patterns might indicate manipulation.\nMetadata:\n${parts.join("\n")}`;
  } else {
    platformContext = "\n\nThis is a news article or blog post. Engagement tactics are less common but missing context analysis is highly relevant.";
  }

  return baseAnalysis + guidelines + platformContext;
}
```

- [ ] **Step 2: Update analyzeArticleWithClaude to accept platform metadata**

Rename `analyzeArticleWithClaude` to `analyzeContentWithClaude` and update its signature and prompt usage:

```js
async function analyzeContentWithClaude(contentHtml, title, apiKey, platform, metadata) {
  if (!apiKey) throw new Error("no_api_key");
  const systemPrompt = buildAnalysisPrompt(platform, metadata);
  const userMsg = `Analyze this content titled "${title}":\n\n${contentHtml}`;

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
      system: systemPrompt,
      messages: [{ role: "user", content: userMsg }],
    }),
  }, ANALYSIS_TIMEOUT_MS);
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Claude API ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");

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
git commit -m "feat: platform-aware analysis prompt with engagement and context detection"
```

---

### Task 4: Update handleAnalyzeContent orchestrator

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Update the orchestrator to use new extractor and prompt**

Replace the `handleAnalyzeContent` function (formerly `handleAnalyzeArticle`) to use the new `extractContent` message and pass platform metadata:

```js
async function handleAnalyzeContent(tabId) {
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

  // Step 2: Extract content (platform-aware).
  progress("Extracting content...");
  let contentResp;
  try {
    contentResp = await chrome.tabs.sendMessage(tabId, { type: "extractContent" });
  } catch (e) {
    return { ok: false, error: "extract_failed", message: `Content extraction failed: ${e.message}` };
  }
  if (!contentResp?.ok || !contentResp.html) {
    return { ok: false, error: "extract_empty", message: "No content found on this page." };
  }

  const { platform, title, html } = contentResp;

  // Step 3: Run TRIBE + Claude in parallel.
  progress("Analyzing content...");

  const tribePromise = (settings.engine === "tribe" && settings.backendUrl && title)
    ? classifyBatchTribe([title], settings.backendUrl).catch(e => {
        console.warn("[MindPrint] TRIBE analysis failed:", e.message);
        return null;
      })
    : Promise.resolve(null);

  const claudePromise = analyzeContentWithClaude(html, title, settings.apiKey, platform, contentResp);

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
    platform,
    metadata: contentResp,
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
  return { ok: true, message: "Analysis complete." };
}
```

- [ ] **Step 2: Commit**

```bash
git add background.js
git commit -m "feat: update orchestrator for platform-aware content extraction"
```

---

### Task 5: Add new banner sections and metadata line to content.js

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Add metadata line to the banner header**

In the `buildBanner` function, after `header.append(label, pills, dismiss);` (line 242), add a metadata line for social platforms:

```js
    // Platform metadata line.
    if (analysis.platform && analysis.platform !== "article" && analysis.metadata) {
      const meta = document.createElement("div");
      meta.className = "mpb-meta";
      const m = analysis.metadata;
      const parts = [];
      if (m.author?.name) parts.push(m.author.handle || m.author.name);
      if (m.author?.verified) parts.push("verified");
      if (m.engagement) {
        if (m.engagement.likes) parts.push(`${m.engagement.likes} likes`);
        if (m.engagement.retweets) parts.push(`${m.engagement.retweets} retweets`);
        if (m.engagement.comments) parts.push(`${m.engagement.comments} comments`);
        if (m.engagement.views) parts.push(`${m.engagement.views} views`);
      }
      meta.textContent = parts.join(" \u00b7 ");
      header.appendChild(meta);
    }
```

- [ ] **Step 2: Add engagement tactics pill to header**

After the fallacies pill block (after the `if (claude.fallacies?.summary)` block, around line 233), add:

```js
    if (claude.engagement_tactics?.summary) {
      const pill = document.createElement("span");
      pill.className = "mpb-pill mpb-pill-engage";
      pill.textContent = claude.engagement_tactics.summary;
      pill.addEventListener("click", () => toggleSection(banner, "engagement"));
      pills.appendChild(pill);
    }
    if (claude.missing_context?.summary) {
      const pill = document.createElement("span");
      pill.className = "mpb-pill mpb-pill-context";
      pill.textContent = claude.missing_context.summary;
      pill.addEventListener("click", () => toggleSection(banner, "context"));
      pills.appendChild(pill);
    }
```

- [ ] **Step 3: Add engagement tactics and missing context sections**

After the fallacies section (after `banner.appendChild(fallacySection);`, around line 337), add:

```js
    // Engagement tactics section.
    const engageSection = buildSection("engagement", "Engagement Tactics", () => {
      const frag = document.createDocumentFragment();
      const items = claude.engagement_tactics?.items || [];
      if (items.length === 0) {
        const p = document.createElement("p");
        p.textContent = "No engagement tactics detected.";
        frag.appendChild(p);
        return frag;
      }
      for (const item of items) {
        const card = document.createElement("div");
        card.className = "mpb-engage-card";
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
    banner.appendChild(engageSection);

    // Missing context section.
    const contextSection = buildSection("context", "Missing Context", () => {
      const frag = document.createDocumentFragment();
      const items = claude.missing_context?.items || [];
      if (items.length === 0) {
        const p = document.createElement("p");
        p.textContent = "No significant context gaps identified.";
        frag.appendChild(p);
        return frag;
      }
      for (const item of items) {
        const card = document.createElement("div");
        card.className = "mpb-context-card";
        const sev = document.createElement("span");
        sev.className = `mpb-sev-badge sev-${item.severity || "medium"}`;
        sev.textContent = item.severity || "medium";
        const typeEl = document.createElement("strong");
        typeEl.textContent = item.type || "Unknown";
        const detail = document.createElement("p");
        detail.textContent = item.detail || "";
        card.append(sev, typeEl, detail);
        frag.appendChild(card);
      }
      return frag;
    });
    banner.appendChild(contextSection);
```

- [ ] **Step 4: Commit**

```bash
git add content.js
git commit -m "feat: add engagement tactics and missing context sections to banner"
```

---

### Task 6: Add new CSS styles

**Files:**
- Modify: `content.css`

- [ ] **Step 1: Add new pill and card styles**

Add before the `/* ---------- Banner dark mode ---------- */` comment (before line 233):

```css
.mpb-pill-engage  { background: #fff0e0; border: 1px solid #e5b87a; color: #7a4b10; }
.mpb-pill-context { background: #f0e6ff; border: 1px solid #c0a5e8; color: #5b2d9a; }

.mpb-meta {
  font-size: 11px;
  color: #5b636d;
  margin-top: 2px;
}

.mpb-engage-card {
  padding: 8px 0;
  border-bottom: 1px solid #e1e4e8;
}
.mpb-engage-card:last-child { border-bottom: none; }

.mpb-context-card {
  padding: 8px 0;
  border-bottom: 1px solid #e1e4e8;
}
.mpb-context-card:last-child { border-bottom: none; }

.mpb-sev-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  margin-right: 8px;
  vertical-align: middle;
}
.sev-high   { background: #ffe4e1; color: #9a1b1b; }
.sev-medium { background: #fff4d6; color: #7a5b10; }
.sev-low    { background: #eef0f3; color: #4a4f58; }
```

Add to the dark mode block (inside the existing `@media (prefers-color-scheme: dark)` at line 235), before the closing `}`:

```css
  .mpb-pill-engage  { background: #4a3a12; border-color: #7a5f21; color: #ffe2a1; }
  .mpb-pill-context { background: #2e1f4f; border-color: #4a337a; color: #d7c6ff; }
  .mpb-meta { color: #a0a6ad; }
  .mpb-engage-card { border-bottom-color: #2a2f37; }
  .mpb-context-card { border-bottom-color: #2a2f37; }
  .sev-high   { background: #4a1f1b; color: #ffc6bf; }
  .sev-medium { background: #4a3a12; color: #ffe2a1; }
  .sev-low    { background: #2a2f37; color: #c9ccd3; }
```

- [ ] **Step 2: Commit**

```bash
git add content.css
git commit -m "feat: add engagement tactics and missing context CSS with dark mode"
```

---

### Task 7: End-to-end manual test

- [ ] **Step 1: Reload extension**

Go to `chrome://extensions`, click refresh on MindPrint.

- [ ] **Step 2: Verify popup shows "Analyze" button**

Click MindPrint icon. Confirm the button reads "Analyze" (not "Analyze article").

- [ ] **Step 3: Test on a news article**

Navigate to a BBC article. Click "Analyze". Verify:
- All 6 sections appear (Tone, Fact Check, Logical Fallacies, Engagement Tactics, Missing Context, Summary)
- Engagement Tactics likely shows "No engagement tactics detected" for a news article
- Missing Context may flag missing sources or selective framing

- [ ] **Step 4: Test on X (Twitter)**

Navigate to a post on x.com. Click "Analyze". Verify:
- Metadata line shows in the header (handle, verified status, engagement counts)
- All 6 sections appear
- Engagement tactics section is populated if the post has rage bait, urgency cues, etc.
- Post text is correctly extracted and analyzed

- [ ] **Step 5: Test on Instagram**

Navigate to an Instagram post. Click "Analyze". Verify:
- Metadata line shows author and engagement counts
- All 6 sections appear
- Caption text is extracted and analyzed
- Hashtags are mentioned in context if relevant

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: MindPrint Phase 1 — social media manipulation analysis for X and Instagram"
```

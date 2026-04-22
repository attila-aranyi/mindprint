# Any-Site Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded 5-site auto-scan with an on-demand "Scan this page" button that uses Claude Haiku to extract headlines from any webpage, then classifies them via the existing engine (TRIBE or Claude).

**Architecture:** User clicks "Scan this page" in the popup. Background script programmatically injects the content script, which extracts stripped semantic HTML. Background sends it to Claude Haiku for headline identification, then runs existing classification pipeline, then sends results back to the content script for badge injection.

**Tech Stack:** Chrome Extension MV3, Chrome Scripting API, Anthropic Messages API (Haiku), existing TRIBE/Claude classification pipeline.

---

### Task 1: Update manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Replace manifest.json content**

Remove the `content_scripts` block (no more auto-injection). Add `"scripting"` permission for programmatic injection. Remove site-specific `host_permissions`. Keep API/backend permissions and `optional_host_permissions`.

```json
{
  "manifest_version": 3,
  "name": "MindPrint — Headline Reaction Detector",
  "version": "0.2.0",
  "description": "Predicts the intended emotional reaction engineered into news headlines. Inspired by TRIBE v2, powered by Claude.",
  "permissions": ["storage", "activeTab", "scripting"],
  "host_permissions": [
    "https://api.anthropic.com/*",
    "https://*.modal.run/*"
  ],
  "optional_host_permissions": [
    "http://*/*",
    "https://*/*"
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "MindPrint — Headline Reaction Detector"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

Key changes:
- Added `"scripting"` to permissions
- Removed all site-specific host_permissions (BBC, Reuters, etc.)
- Removed entire `content_scripts` block
- Bumped version to 0.2.0

- [ ] **Step 2: Verify manifest loads**

Reload the extension in `chrome://extensions`. Check for no errors on the extension card.

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: update manifest for on-demand scanning — add scripting permission, remove auto-inject"
```

---

### Task 2: Rewrite content.js for on-demand extraction and decoration

**Files:**
- Modify: `content.js`

- [ ] **Step 1: Replace content.js with message-driven architecture**

The content script no longer auto-scans. It listens for two messages from the background script:
- `extractDOM` — returns stripped semantic HTML
- `decorate` — injects badges for classified headlines

```js
// MindPrint — content script (on-demand).
// Injected programmatically by the background script when the user clicks "Scan this page".
// Two capabilities:
//   - extractDOM: returns stripped semantic HTML for headline extraction
//   - decorate:   injects emotion badges next to classified headlines

(() => {
  "use strict";

  const TAXONOMY = {
    outrage:   { emoji: "\u{1F621}", label: "outrage" },
    fear:      { emoji: "\u{1F628}", label: "fear" },
    curiosity: { emoji: "\u{1F914}", label: "curiosity" },
    hope:      { emoji: "\u{1F331}", label: "hope" },
    sadness:   { emoji: "\u{1F622}", label: "sadness" },
    pride:     { emoji: "\u{1F99A}", label: "pride" },
    amusement: { emoji: "\u{1F604}", label: "amusement" },
    disgust:   { emoji: "\u{1F922}", label: "disgust" },
    neutral:   { emoji: "\u25FD",    label: "neutral" },
  };

  const MARK_ATTR = "data-mindprint";
  const MAX_DOM_LEN = 15000;

  // ---------- DOM extraction ----------

  const KEEP_TAGS = new Set([
    "H1", "H2", "H3", "H4", "H5", "H6", "A", "FIGCAPTION",
    "ARTICLE", "MAIN", "SECTION", "NAV", "HEADER",
  ]);

  function extractDOM() {
    const parts = [];
    const root = document.querySelector("main") || document.querySelector("article") || document.body;

    function walk(el) {
      if (!el || !el.tagName) return;
      const tag = el.tagName;

      // Skip invisible, script, style, svg, etc.
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "NOSCRIPT") return;
      if (tag === "NAV" && parts.length > MAX_DOM_LEN * 0.8) return; // skip nav if already long

      const isKeep = KEEP_TAGS.has(tag) || el.getAttribute("role") === "heading";

      if (isKeep) {
        const openTag = tag === "A" && el.href
          ? `<${tag.toLowerCase()} href="${el.getAttribute("href")}">`
          : `<${tag.toLowerCase()}>`;
        const text = el.textContent.replace(/\s+/g, " ").trim();
        if (text.length > 3 && text.length < 300) {
          parts.push(`${openTag}${text}</${tag.toLowerCase()}>`);
        }
        return; // don't recurse into kept elements — we already grabbed the text
      }

      for (const child of el.children) {
        if (parts.join("").length >= MAX_DOM_LEN) break;
        walk(child);
      }
    }

    walk(root);
    return parts.join("\n").slice(0, MAX_DOM_LEN);
  }

  // ---------- headline node finding ----------

  function normalizeText(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function findNodeForHeadline(text) {
    const normalized = normalizeText(text);
    if (!normalized) return null;

    // Try headings and links first — most likely to be the actual headline element.
    const candidates = document.querySelectorAll(
      'h1, h2, h3, h4, h5, h6, a, [role="heading"], figcaption'
    );
    for (const el of candidates) {
      if (el.getAttribute(MARK_ATTR)) continue;
      const elText = normalizeText(el.textContent);
      if (elText === normalized) return el;
    }
    // Fuzzy: check if the element text contains the headline (or vice versa).
    for (const el of candidates) {
      if (el.getAttribute(MARK_ATTR)) continue;
      const elText = normalizeText(el.textContent);
      if (elText.length > 10 && elText.length < 500) {
        if (elText.includes(normalized) || normalized.includes(elText)) return el;
      }
    }
    return null;
  }

  // ---------- badge decoration ----------

  function decorate(node, headline, result) {
    if (!node || !node.isConnected) return;
    if (node.getAttribute(MARK_ATTR)) return;
    node.setAttribute(MARK_ATTR, headline);

    const entry = TAXONOMY[result.label] || TAXONOMY.neutral;
    const badge = document.createElement("span");
    badge.className = `mindprint-badge mindprint-${result.label}`;
    badge.setAttribute("role", "note");
    const pct = Math.round((result.confidence ?? 0.5) * 100);
    badge.title = `MindPrint: ${entry.label} (${pct}% conf)\n${result.reasoning || ""}`;
    badge.textContent = `${entry.emoji} ${entry.label}`;
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    const parent = node.parentNode;
    if (parent) {
      if (node.nextSibling) parent.insertBefore(badge, node.nextSibling);
      else parent.appendChild(badge);
    } else {
      node.appendChild(badge);
    }
  }

  // ---------- message listener ----------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "extractDOM") {
      sendResponse({ ok: true, html: extractDOM() });
    } else if (msg?.type === "decorate") {
      const results = msg.results || {};
      let decorated = 0;
      for (const [headline, result] of Object.entries(results)) {
        const node = findNodeForHeadline(headline);
        if (node) {
          decorate(node, headline, result);
          decorated++;
        }
      }
      sendResponse({ ok: true, decorated });
    }
    return true;
  });
})();
```

- [ ] **Step 2: Verify content script syntax**

Open the browser DevTools console and check that no syntax errors appear. The script won't do anything on its own — it just waits for messages.

- [ ] **Step 3: Commit**

```bash
git add content.js
git commit -m "feat: rewrite content.js for on-demand extraction and decoration"
```

---

### Task 3: Update background.js — add headline extraction and scan orchestrator

**Files:**
- Modify: `background.js`

- [ ] **Step 1: Add the headline extraction system prompt and function**

Add these after the existing `CLAUDE_SYSTEM_PROMPT` constant (around line 47):

```js
const EXTRACT_SYSTEM_PROMPT = `You extract news/article headlines from a simplified HTML snippet of a webpage. The HTML contains headings (h1-h6), links (a), and structural tags.

Identify elements that are actual article/story headlines — not navigation labels, section headers, footer links, or UI text. A headline is a title of a news article, blog post, or story that a reader would click to read more.

Respond with ONLY a JSON array. No prose, no markdown fences. Each element:
{"text": "<exact headline text as it appears>"}

Return at most 50 headlines. If the page has no identifiable headlines, return an empty array [].`;

const EXTRACT_TIMEOUT_MS = 15000;
const MAX_EXTRACT_HEADLINES = 50;
```

- [ ] **Step 2: Add the extractHeadlines function**

Add this after the `classifyBatchClaude` function (around line 227):

```js
// ---------- headline extraction via Claude ----------

async function extractHeadlines(strippedHtml, apiKey) {
  if (!apiKey) throw new Error("no_api_key");
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
      max_tokens: 2048,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Extract headlines from this page HTML:\n\n${strippedHtml}` }],
    }),
  });
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
```

- [ ] **Step 3: Add the handleScanPage orchestrator**

Add this after `extractHeadlines`:

```js
// ---------- scan page orchestrator ----------

async function handleScanPage(tabId) {
  const settings = await getSettings();
  if (!settings.enabled) return { ok: false, error: "disabled" };
  if (!settings.apiKey) return { ok: false, error: "no_api_key", message: "Set an Anthropic API key first." };

  // Step 1: Inject content script + CSS into the tab.
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
  let headlines;
  try {
    headlines = await extractHeadlines(domResp.html, settings.apiKey);
  } catch (e) {
    return { ok: false, error: "headline_extract_failed", message: `Headline extraction failed: ${e.message}` };
  }
  if (headlines.length === 0) {
    return { ok: true, count: 0, message: "No headlines found on this page." };
  }

  // Step 4: Classify headlines via existing pipeline.
  const classifyResult = await handleClassify(headlines);
  if (!classifyResult.ok) {
    return {
      ok: false,
      error: classifyResult.error,
      message: `Found ${headlines.length} headlines but classification failed: ${classifyResult.error}`,
      count: headlines.length,
    };
  }

  // Step 5: Send results to content script for badge injection.
  let decorateResp;
  try {
    decorateResp = await chrome.tabs.sendMessage(tabId, {
      type: "decorate",
      results: classifyResult.results,
    });
  } catch (e) {
    return { ok: false, error: "decorate_failed", message: `Badge injection failed: ${e.message}` };
  }

  return {
    ok: true,
    count: headlines.length,
    decorated: decorateResp?.decorated || 0,
    message: `Analyzed ${headlines.length} headlines, decorated ${decorateResp?.decorated || 0}.`,
  };
}
```

- [ ] **Step 4: Remove `sites` from default settings**

In the `getSettings` function, remove the `sites` property from `defaults`:

Change:
```js
    enabled: true,
    sites: {
      "www.bbc.com": true,
      "www.bbc.co.uk": true,
      "www.reuters.com": true,
      "www.theguardian.com": true,
      "news.ycombinator.com": true,
    },
    analyzedToday: 0,
```

To:
```js
    enabled: true,
    analyzedToday: 0,
```

- [ ] **Step 5: Add scanPage message handler**

In the `chrome.runtime.onMessage.addListener` block, add a handler for `scanPage` after the `classify` handler:

```js
      } else if (msg?.type === "scanPage") {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) { sendResponse({ ok: false, error: "no_tab" }); return; }
        sendResponse(await handleScanPage(tab.id));
```

Insert this between the `classify` handler and the `getSettings` handler.

- [ ] **Step 6: Verify background script loads**

Reload the extension. Go to `chrome://extensions`, click "service worker" link on MindPrint. Confirm no errors in the console.

- [ ] **Step 7: Commit**

```bash
git add background.js
git commit -m "feat: add headline extraction via Claude and scanPage orchestrator"
```

---

### Task 4: Update popup.html — replace sites with scan button

**Files:**
- Modify: `popup.html`

- [ ] **Step 1: Replace the Sites section and add Scan button**

Replace the sites section:
```html
  <section>
    <div class="field-label">Sites</div>
    <ul class="sites" id="sites"></ul>
  </section>
```

With:
```html
  <section class="scan-section">
    <button id="scanPage" type="button" class="scan-btn">Scan this page</button>
    <div id="scanStatus" class="status"></div>
  </section>
```

- [ ] **Step 2: Commit**

```bash
git add popup.html
git commit -m "feat: replace sites list with scan button in popup"
```

---

### Task 5: Update popup.js — remove sites, add scan handler

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Replace popup.js entirely**

```js
// MindPrint — popup UI.

const els = {
  enabled: document.getElementById("enabled"),
  engineRadios: document.querySelectorAll('input[name="engine"]'),
  tribeSection: document.getElementById("tribe-section"),
  claudeSection: document.getElementById("claude-section"),
  backendUrl: document.getElementById("backendUrl"),
  saveBackend: document.getElementById("saveBackend"),
  testBackend: document.getElementById("testBackend"),
  fallbackToClaude: document.getElementById("fallbackToClaude"),
  backendStatus: document.getElementById("backendStatus"),
  apiKey: document.getElementById("apiKey"),
  saveKey: document.getElementById("saveKey"),
  keyStatus: document.getElementById("keyStatus"),
  scanPage: document.getElementById("scanPage"),
  scanStatus: document.getElementById("scanStatus"),
  today: document.getElementById("today"),
  clearCache: document.getElementById("clearCache"),
};

function setStatus(el, msg, kind = "") {
  el.textContent = msg;
  el.className = "status " + kind;
  if (kind !== "progress" && msg) setTimeout(() => {
    if (el.textContent === msg) { el.textContent = ""; el.className = "status"; }
  }, 5000);
}

function send(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

function applyEngineUI(engine) {
  for (const r of els.engineRadios) r.checked = r.value === engine;
  els.tribeSection.style.display  = engine === "tribe"  ? "" : "none";
  els.claudeSection.style.display = engine === "claude" || document.getElementById("fallbackToClaude")?.checked ? "" : "none";
}

async function load() {
  const s = await send({ type: "getSettings" });
  els.enabled.checked = !!s.enabled;
  els.fallbackToClaude.checked = !!s.fallbackToClaude;
  els.backendUrl.value = s.backendUrl || "";
  els.apiKey.value = "";
  els.apiKey.placeholder = s.apiKey ? "\u2022\u2022\u2022 key saved (overwrite to replace)" : "sk-ant-\u2026";
  els.today.textContent = `${s.analyzedToday || 0} analyzed today`;
  applyEngineUI(s.engine || "tribe");
}

// ---- handlers ----

els.enabled.addEventListener("change", async () => {
  await send({ type: "saveSettings", patch: { enabled: els.enabled.checked } });
});

for (const r of els.engineRadios) {
  r.addEventListener("change", async () => {
    if (!r.checked) return;
    await send({ type: "saveSettings", patch: { engine: r.value } });
    applyEngineUI(r.value);
  });
}

els.fallbackToClaude.addEventListener("change", async () => {
  await send({ type: "saveSettings", patch: { fallbackToClaude: els.fallbackToClaude.checked } });
  const engine = [...els.engineRadios].find(r => r.checked)?.value || "tribe";
  applyEngineUI(engine);
});

els.saveBackend.addEventListener("click", async () => {
  const v = els.backendUrl.value.trim().replace(/\/+$/, "");
  if (!v) { setStatus(els.backendStatus, "Enter a URL first.", "err"); return; }
  if (!/^https?:\/\//.test(v)) { setStatus(els.backendStatus, "URL must start with http(s)://", "err"); return; }
  try {
    const origin = new URL(v).origin + "/*";
    const already = await chrome.permissions.contains({ origins: [origin] });
    if (!already) {
      const granted = await chrome.permissions.request({ origins: [origin] });
      if (!granted) { setStatus(els.backendStatus, "Permission denied.", "err"); return; }
    }
  } catch (e) {
    setStatus(els.backendStatus, "Invalid URL.", "err"); return;
  }
  await send({ type: "saveSettings", patch: { backendUrl: v } });
  setStatus(els.backendStatus, "Saved.", "ok");
});

els.testBackend.addEventListener("click", async () => {
  const url = els.backendUrl.value.trim().replace(/\/+$/, "");
  if (!url) { setStatus(els.backendStatus, "Enter a URL first.", "err"); return; }
  setStatus(els.backendStatus, "Testing\u2026");
  const r = await send({ type: "testBackend", url });
  if (r?.ok) setStatus(els.backendStatus, `OK (${r.status || 200})`, "ok");
  else setStatus(els.backendStatus, `Failed: ${r?.error || r?.status || "unknown"}`, "err");
});

els.saveKey.addEventListener("click", async () => {
  const v = els.apiKey.value.trim();
  if (!v) { setStatus(els.keyStatus, "Enter a key first.", "err"); return; }
  if (!v.startsWith("sk-ant-")) { setStatus(els.keyStatus, "That doesn't look like an Anthropic key.", "err"); return; }
  await send({ type: "saveSettings", patch: { apiKey: v } });
  els.apiKey.value = "";
  els.apiKey.placeholder = "\u2022\u2022\u2022 key saved (overwrite to replace)";
  setStatus(els.keyStatus, "Saved.", "ok");
});

els.scanPage.addEventListener("click", async () => {
  els.scanPage.disabled = true;
  setStatus(els.scanStatus, "Scanning\u2026", "progress");
  try {
    const r = await send({ type: "scanPage" });
    if (r?.ok) {
      setStatus(els.scanStatus, r.message || `Done: ${r.count} headlines.`, "ok");
      // Refresh the analyzed count.
      const s = await send({ type: "getSettings" });
      els.today.textContent = `${s.analyzedToday || 0} analyzed today`;
    } else {
      setStatus(els.scanStatus, r?.message || r?.error || "Scan failed.", "err");
    }
  } catch (e) {
    setStatus(els.scanStatus, `Error: ${e.message}`, "err");
  } finally {
    els.scanPage.disabled = false;
  }
});

els.clearCache.addEventListener("click", async () => {
  const resp = await send({ type: "clearCache" });
  if (resp?.ok) setStatus(els.scanStatus, `Cleared ${resp.cleared} cached labels.`, "ok");
});

load();
```

Key changes:
- Removed `SITES` array, `renderSites` function, and the `sites` element reference
- Added `scanPage` and `scanStatus` element references
- Added scan button click handler that calls `{ type: "scanPage" }`
- `setStatus` timeout increased to 5s and skipped for `"progress"` kind
- `clearCache` now targets `scanStatus` instead of `backendStatus`

- [ ] **Step 2: Commit**

```bash
git add popup.js
git commit -m "feat: replace sites UI with scan button handler"
```

---

### Task 6: Update popup.css — add scan button styles, remove sites styles

**Files:**
- Modify: `popup.css`

- [ ] **Step 1: Replace the `.sites` CSS block with scan button styles**

Remove these blocks (lines 176-194):
```css
.sites {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 10px;
}

.sites li {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.sites input[type="checkbox"] {
  margin: 0;
}
```

Replace with:
```css
.scan-section {
  text-align: center;
}

.scan-btn {
  width: 100%;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 8px;
}

.scan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status.progress {
  color: var(--muted);
}
```

- [ ] **Step 2: Commit**

```bash
git add popup.css
git commit -m "feat: add scan button styles, remove sites grid styles"
```

---

### Task 7: End-to-end manual test

- [ ] **Step 1: Reload extension**

Go to `chrome://extensions`, click the refresh icon on MindPrint.

- [ ] **Step 2: Verify popup renders correctly**

Click the MindPrint icon. Confirm:
- "Scan this page" button is visible and prominent
- No "Sites" section
- Engine toggle, backend URL, API key sections all render correctly

- [ ] **Step 3: Test scan on a news site**

1. Navigate to `https://www.bbc.com`
2. Click the MindPrint icon
3. Click "Scan this page"
4. Confirm status shows "Scanning..." then a success message
5. Confirm emotion badges appear next to headlines on the page

- [ ] **Step 4: Test scan on a non-news site**

1. Navigate to a page with no headlines (e.g., `https://example.com`)
2. Click "Scan this page"
3. Confirm it shows "No headlines found on this page."

- [ ] **Step 5: Test error: no API key**

1. Clear the API key from settings
2. Click "Scan this page"
3. Confirm it shows the "Set an Anthropic API key first" error

- [ ] **Step 6: Test on chrome:// pages**

1. Navigate to `chrome://extensions`
2. Click "Scan this page"
3. Confirm it shows "Cannot access this page" error (Chrome blocks script injection on chrome:// URLs)

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: MindPrint v0.2.0 — scan any page on demand via Claude headline extraction"
```

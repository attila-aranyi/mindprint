// MindPrint — content script
// Finds headline nodes on supported sites, asks the service worker to classify,
// and injects a pill badge next to each headline.

(() => {
  "use strict";

  // Taxonomy mirrors background.js.
  const TAXONOMY = {
    outrage:   { emoji: "😡", label: "outrage" },
    fear:      { emoji: "😨", label: "fear" },
    curiosity: { emoji: "🤔", label: "curiosity" },
    hope:      { emoji: "🌱", label: "hope" },
    sadness:   { emoji: "😢", label: "sadness" },
    pride:     { emoji: "🦚", label: "pride" },
    amusement: { emoji: "😄", label: "amusement" },
    disgust:   { emoji: "🤢", label: "disgust" },
    neutral:   { emoji: "◽", label: "neutral" },
  };

  // Per-host selectors. Sites redesign often, so we try a short list of
  // selectors in order and accept any matches.
  const SITE_SELECTORS = {
    "www.bbc.com": [
      '[data-testid="card-headline"]',
      '[data-testid="internal-link"] h2',
      'a[href*="/news/"] h2',
      'a[href*="/news/"] h3',
      'a[href*="/sport/"] h2',
    ],
    "www.bbc.co.uk": [
      'a[href*="/news/"] h2',
      'a[href*="/news/"] h3',
    ],
    "www.reuters.com": [
      'a[data-testid="Link"]',
      'h3[data-testid*="Heading"]',
      'a[href*="/world/"]',
      'a[href*="/business/"]',
      'a[href*="/technology/"]',
    ],
    "www.theguardian.com": [
      '[data-link-name="article"] span',
      'a[data-link-name="article"]',
      '.fc-item__title',
      '.js-headline-text',
    ],
    "news.ycombinator.com": [
      '.titleline > a',
    ],
  };

  const host = location.hostname;
  const selectors = SITE_SELECTORS[host];
  if (!selectors) return;

  const MARK_ATTR = "data-mindprint";            // set to the headline text once queued
  const PENDING_ATTR = "data-mindprint-pending"; // in-flight

  const MIN_LEN = 12;
  const MAX_LEN = 300;
  const DEBOUNCE_MS = 400;
  const QUEUE_FLUSH_MS = 150;

  // headlineText -> [element, element, ...]
  const pendingNodes = new Map();
  // headlineText -> result { label, emoji, confidence, reasoning }
  const resultCache = new Map();
  let flushTimer = null;
  let scanTimer = null;

  function normalizeHeadline(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function isVisible(el) {
    if (!el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  }

  function collectHeadlines() {
    const found = [];
    for (const sel of selectors) {
      let nodes;
      try { nodes = document.querySelectorAll(sel); }
      catch { continue; }
      for (const n of nodes) {
        if (n.getAttribute(MARK_ATTR) || n.getAttribute(PENDING_ATTR)) continue;
        if (!isVisible(n)) continue;
        const text = normalizeHeadline(n.textContent);
        if (text.length < MIN_LEN || text.length > MAX_LEN) continue;
        found.push({ node: n, text });
      }
    }
    return found;
  }

  function enqueue(nodes) {
    if (nodes.length === 0) return;
    for (const { node, text } of nodes) {
      node.setAttribute(PENDING_ATTR, "1");
      const cached = resultCache.get(text);
      if (cached) {
        decorate(node, text, cached);
        continue;
      }
      const list = pendingNodes.get(text) || [];
      list.push(node);
      pendingNodes.set(text, list);
    }
    if (!flushTimer) flushTimer = setTimeout(flush, QUEUE_FLUSH_MS);
  }

  async function flush() {
    flushTimer = null;
    if (pendingNodes.size === 0) return;
    const headlines = [...pendingNodes.keys()];
    const snapshot = new Map(pendingNodes);
    pendingNodes.clear();

    let resp;
    try {
      resp = await chrome.runtime.sendMessage({ type: "classify", headlines });
    } catch (e) {
      console.warn("[MindPrint] send failed:", e);
      return;
    }
    if (!resp || !resp.ok) {
      const err = resp?.error;
      if (err === "no_api_key") {
        console.info("[MindPrint] No API key set. Open the extension popup to add one, then refresh.");
      } else if (err !== "disabled") {
        console.warn("[MindPrint] classify failed:", err);
      }
      // For terminal config errors keep nodes marked so we don't retry every mutation.
      // For transient errors, clear the pending flag so a future scan can retry.
      const terminal = err === "no_api_key" || err === "disabled";
      if (terminal) {
        for (const list of snapshot.values()) for (const n of list) n.setAttribute(MARK_ATTR, "skip");
      } else {
        for (const list of snapshot.values()) for (const n of list) n.removeAttribute(PENDING_ATTR);
      }
      if (resp?.partial) applyResults(resp.partial, snapshot);
      return;
    }
    applyResults(resp.results || {}, snapshot);
  }

  function applyResults(results, snapshot) {
    for (const [headline, result] of Object.entries(results)) {
      resultCache.set(headline, result);
      const nodes = snapshot.get(headline) || [];
      for (const n of nodes) decorate(n, headline, result);
    }
  }

  function decorate(node, headline, result) {
    if (!node.isConnected) return;
    if (node.getAttribute(MARK_ATTR)) return;
    node.setAttribute(MARK_ATTR, headline);
    node.removeAttribute(PENDING_ATTR);

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

    // Attach after the headline element when possible; fall back to appending inside.
    const parent = node.parentNode;
    if (parent) {
      // insert as next sibling; inline-block styling in CSS keeps it on the same line
      if (node.nextSibling) parent.insertBefore(badge, node.nextSibling);
      else parent.appendChild(badge);
    } else {
      node.appendChild(badge);
    }
  }

  function scheduleScan() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      scanTimer = null;
      enqueue(collectHeadlines());
    }, DEBOUNCE_MS);
  }

  // Initial scan once the page is idle-ish.
  scheduleScan();

  // Re-scan on DOM changes (news sites lazy-load and reshuffle cards).
  const observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
  });

  // Re-scan on SPA navigation.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleScan();
    }
  }, 1000);
})();

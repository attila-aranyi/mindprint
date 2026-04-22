// MindPrint — content script (on-demand).
// Injected programmatically by the background script when the user clicks "Scan this page".
// Two capabilities:
//   - extractDOM: returns stripped semantic HTML for headline extraction
//   - decorate:   injects emotion badges next to classified headlines

(() => {
  "use strict";

  if (window.__mindprintLoaded) return;
  window.__mindprintLoaded = true;

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

  // Tags whose text content we capture as headline candidates.
  const LEAF_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "A", "FIGCAPTION"]);
  // Structural tags we recurse into but don't capture directly.
  const CONTAINER_TAGS = new Set(["ARTICLE", "MAIN", "SECTION", "NAV", "HEADER", "DIV", "UL", "OL", "LI"]);

  function extractDOM() {
    const parts = [];
    let totalLen = 0;
    const root = document.querySelector("main") || document.querySelector("article") || document.body;

    function walk(el) {
      if (!el || !el.tagName) return;
      if (totalLen >= MAX_DOM_LEN) return;
      const tag = el.tagName;

      // Skip invisible, script, style, svg, etc.
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "SVG" || tag === "NOSCRIPT" || tag === "IFRAME") return;

      const isLeaf = LEAF_TAGS.has(tag) || el.getAttribute("role") === "heading";

      if (isLeaf) {
        const openTag = tag === "A" && el.href
          ? `<${tag.toLowerCase()} href="${el.getAttribute("href")}">`
          : `<${tag.toLowerCase()}>`;
        const text = el.textContent.replace(/\s+/g, " ").trim();
        if (text.length > 3 && text.length < 300) {
          const line = `${openTag}${text}</${tag.toLowerCase()}>`;
          parts.push(line);
          totalLen += line.length + 1;
        }
        return; // don't recurse into leaf elements — we already grabbed the text
      }

      // Recurse into children for container and unknown tags.
      for (const child of el.children) {
        if (totalLen >= MAX_DOM_LEN) break;
        walk(child);
      }
    }

    walk(root);
    return parts.join("\n").slice(0, MAX_DOM_LEN);
  }

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
    } else if (msg?.type === "extractArticle") {
      sendResponse({ ok: true, ...extractArticle() });
    }
    return true;
  });
})();

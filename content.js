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

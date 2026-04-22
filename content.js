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

    const timeEl = document.querySelector('article time[datetime]');
    const timestamp = timeEl ? timeEl.getAttribute("datetime") : null;

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

    const quotedEl = document.querySelector('[data-testid="quoteTweet"] [data-testid="tweetText"]');
    const quotedText = quotedEl ? quotedEl.textContent.replace(/\s+/g, " ").trim() : null;

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
    let captionText = "";
    const captionEl = document.querySelector('h1')
      || document.querySelector('[data-testid="post-comment-root"] span')
      || document.querySelector('div[role="dialog"] ul li span');
    if (captionEl) captionText = captionEl.textContent.replace(/\s+/g, " ").trim();

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

    const engagement = { likes: 0, comments: 0 };
    const likeEl = document.querySelector('section a[href*="liked_by"], section span');
    if (likeEl) {
      const likeMatch = likeEl.textContent.replace(/,/g, "").match(/([\d]+)/);
      if (likeMatch) engagement.likes = parseInt(likeMatch[1], 10) || 0;
    }
    const commentEls = document.querySelectorAll('ul > li[role="menuitem"], ul > div > li');
    engagement.comments = Math.max(0, commentEls.length - 1);

    const hashtags = [];
    const hashMatches = captionText.match(/#\w+/g);
    if (hashMatches) hashtags.push(...hashMatches.map(h => h.slice(1)));

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

  // ---------- analysis banner ----------

  const CONF_COLORS = { high: "conf-high", medium: "conf-med", low: "conf-low", unverifiable: "conf-unv" };

  function buildBanner(analysis) {
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

    const dismiss = document.createElement("button");
    dismiss.className = "mpb-dismiss";
    dismiss.textContent = "\u00D7";
    dismiss.title = "Dismiss";
    dismiss.addEventListener("click", () => banner.remove());

    header.append(label, pills, dismiss);

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
    } else if (msg?.type === "extractContent") {
      sendResponse({ ok: true, ...extractContent() });
    } else if (msg?.type === "injectBanner") {
      const banner = buildBanner(msg.analysis);
      document.body.appendChild(banner);
      sendResponse({ ok: true });
    } else if (msg?.type === "removeBanner") {
      const existing = document.querySelector(".mindprint-banner");
      if (existing) existing.remove();
      sendResponse({ ok: true });
    }
    return true;
  });
})();

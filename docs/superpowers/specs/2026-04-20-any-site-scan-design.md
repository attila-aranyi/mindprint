# MindPrint "Any Site" — LLM-based headline extraction

## Summary

Replace the hardcoded 5-site auto-scan with a universal on-demand "Scan this page" flow. The user clicks the extension icon on any page, hits a button, and MindPrint extracts headlines via Claude, classifies their emotional framing, and injects badges — all in one click.

## User flow

1. User visits any webpage and clicks the MindPrint extension icon.
2. Popup shows a **"Scan this page"** button.
3. One click triggers the full pipeline: DOM extraction, headline identification, emotion classification, badge injection.
4. Popup shows progress status ("Extracting...", "Classifying 12 headlines...", "Done").
5. Badges appear inline next to each detected headline on the page.

## Architecture

### Trigger model

All scanning is **on-demand** — the user clicks a button in the popup. There is no auto-injection on page load. This controls API costs and avoids privacy concerns from silently sending page content to an LLM.

### Pipeline

```
[Popup] -- "scan" --> [Background SW] -- inject --> [Content Script]
                                                         |
                                                    extractDOM()
                                                         |
                                              stripped semantic HTML
                                                         |
[Background SW] <---------------------------------------|
       |
       |-- POST Claude Haiku (extraction prompt)
       |       --> JSON array of headline strings
       |
       |-- POST classify engine (TRIBE or Claude, per settings)
       |       --> { headline: { label, confidence, reasoning, ... } }
       |
       |-- sendMessage to content script tab
       |
[Content Script] -- decorateResults(results) --> badges on page
```

### DOM extraction (content script)

The content script builds a stripped semantic HTML snapshot:

- **Included elements:** `h1`-`h6`, `a` (within `article`, `main`, `section`, `nav`, or `body`), `[role="heading"]`, `figcaption`
- **Stripped:** all attributes except `href` on links. No styles, no scripts, no images, no data attributes.
- **Truncation:** cap at ~15,000 characters to stay within Haiku's sweet spot for cost/speed.
- **Output:** a string of simplified HTML like `<h2><a href="/news/story">Headline text here</a></h2>`

### Headline extraction (Claude Haiku)

System prompt asks Claude to identify news/article headlines from the stripped HTML. Returns a JSON array of objects:

```json
[
  { "text": "Headline as it appears on page", "selector_hint": "h2 > a" },
  ...
]
```

- `text` is the exact string to match in the DOM for badge placement.
- `selector_hint` is optional context to help the content script locate the element.
- Cap at 50 headlines per page.
- Uses the existing Anthropic API key from settings.

### Emotion classification

Unchanged from current implementation. The extracted headline strings are passed to `handleClassify()` in the background script, which routes to TRIBE or Claude based on the engine setting. Caching still works — repeated scans of the same page skip already-classified headlines.

### Badge injection (content script)

The content script receives classified results and:

1. For each headline text, walks the DOM to find the matching text node(s).
2. Uses `TreeWalker` with text node filtering to find exact or fuzzy matches.
3. Injects the `.mindprint-badge` span after the matched element, same as today.
4. Marks decorated nodes with `data-mindprint` to prevent double-badging on re-scan.

## File changes

### `manifest.json`

- Remove the entire `content_scripts` block (no auto-injection).
- Add `"scripting"` to `permissions` (for programmatic injection via `chrome.scripting.executeScript`).
- Keep `"activeTab"` — grants access to the current tab when the user clicks the icon.
- Keep `"storage"`.
- Remove the hardcoded `host_permissions` for specific news sites.
- Keep `optional_host_permissions` with `"http://*/*"` and `"https://*/*"`.

### `content.js`

- Remove `SITE_SELECTORS` map and all site-specific logic.
- Remove the auto-scan on load (`scheduleScan`, `MutationObserver`, SPA polling).
- Export two capabilities via message listener:
  - `{ type: "extractDOM" }` — returns stripped semantic HTML string.
  - `{ type: "decorate", results }` — injects badges for classified headlines.
- Add `findHeadlineNodes(text)` — uses `TreeWalker` to locate DOM nodes matching a headline string.
- Keep all badge rendering (`decorate()`, CSS classes, TAXONOMY).

### `background.js`

- Add `handleScanPage(tabId)` orchestrator:
  1. Inject content script into tab via `chrome.scripting.executeScript`.
  2. Send `extractDOM` message, receive stripped HTML.
  3. Call Claude Haiku with extraction prompt, receive headline array.
  4. Call `handleClassify(headlines)` (existing function, unchanged).
  5. Send `decorate` message with results to content script.
- Remove `sites` from default settings.
- Add message handler for `{ type: "scanPage" }` from popup.
- Keep all existing classify logic, cache, engine switching, fallback.

### `popup.html` / `popup.js`

- Remove the "Sites" section (checkbox list) entirely.
- Remove the hardcoded `SITES` array.
- Add a prominent **"Scan this page"** button.
- Add a status area below the button showing progress steps.
- Button sends `{ type: "scanPage" }` to background, listens for progress updates.
- Keep all engine configuration (TRIBE/Claude toggle, backend URL, API key, fallback).

### `popup.css`

- Style the new scan button and status area.
- Remove `.sites` styles if any.

### Backend (`modal_app.py`, `app.py`, etc.)

- No changes. The backend receives headlines and returns classifications regardless of how headlines were discovered.

## Error handling

| Scenario | Behavior |
|----------|----------|
| No API key set | Popup shows "Set an Anthropic API key first" with link to settings |
| Claude extraction returns 0 headlines | Popup shows "No headlines found on this page" |
| Claude extraction fails (network/API error) | Popup shows error, offers retry |
| Classify engine fails | Popup shows "Found N headlines but classification failed", offers retry |
| Page has no meaningful content | Claude returns empty array, same as 0 headlines |

## Cost/performance

- **Extraction:** ~2-4k input tokens (stripped HTML), ~500 output tokens. Haiku pricing makes this negligible per scan.
- **Classification:** unchanged from current behavior.
- **Latency:** extraction adds ~1-2s (Haiku is fast). Total pipeline ~3-5s on warm TRIBE, longer on cold start.
- **50 headline cap** prevents runaway costs on link-heavy pages.

## Out of scope

- Auto-scanning on page load (removed intentionally).
- Per-site custom selectors.
- Sending full page HTML or screenshots to the LLM.
- Changing the TRIBE backend or classification taxonomy.

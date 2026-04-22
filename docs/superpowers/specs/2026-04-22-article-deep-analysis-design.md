# Article Deep Analysis

## Summary

Add an "Analyze article" button that performs deep content analysis on any article page. Extracts the full article body, runs TRIBE tone analysis (if configured) in parallel with a Claude-powered analysis covering tone, fact-checking, logical fallacy detection, and an overall summary. Results are injected as a collapsible banner above the article with brief one-liners expandable to detailed evidence.

## User flow

1. User navigates to an article page and clicks the MindPrint extension icon.
2. Popup shows the existing "Scan this page" button plus a new **"Analyze article"** button.
3. User clicks "Analyze article".
4. Popup shows step-by-step progress ("Extracting article...", "Analyzing tone...", "Checking facts...", etc.).
5. A banner appears above the article with collapsed one-liners for each section.
6. User clicks a section header to expand and see detailed evidence, quotes, and reasoning.

## Pipeline

```
[Popup] -- "analyzeArticle" --> [Background SW]
       |
       |-- inject content script
       |-- send "extractArticle" --> [Content Script] --> stripped article HTML + title + image URL
       |
       |-- (parallel) POST TRIBE /classify with article title (if configured)
       |-- (parallel) POST Claude Sonnet with full article HTML + structured analysis prompt
       |
       |-- merge TRIBE tone data into Claude analysis
       |-- send "injectBanner" with merged results --> [Content Script]
       |
[Content Script] -- injects banner above article
```

## Article content extraction

A new `extractArticle` message handler in the content script, broader than the headline-scan `extractDOM`:

- **Included elements:** `h1`-`h6`, `p`, `blockquote`, `ul`, `ol`, `li`, `figcaption`, `a` (with href), `em`, `strong`, `pre`, `code`
- **Also extracts:**
  - Article title: first `<h1>` text, falling back to `document.title`
  - Main image URL: first `<img>` with `src` inside the article container
- **Stripped:** all attributes except `href` on links and `src` on the extracted image. No scripts, styles, ads, nav, footer.
- **Root selection:** `document.querySelector("article")` or `document.querySelector('[role="main"]')` or `document.querySelector("main")` or `document.body`
- **Truncation:** cap at 30,000 characters
- **Output:** `{ title: string, imageUrl: string|null, html: string }`

## TRIBE integration

If the engine setting is "tribe" and `backendUrl` is configured:

- Send the article title to the existing `/classify` endpoint as a single-headline batch
- Runs in parallel with the Claude analysis (via `Promise.all`) to avoid adding latency
- TRIBE result provides: emotion label, confidence, brain-region activation data, all emotion scores
- Displayed as a sub-section under "Tone" in the banner
- If TRIBE fails or is not configured, the tone section uses Claude's analysis only — TRIBE is optional enrichment

## Claude analysis

### Model

Claude Sonnet (not Haiku) for reasoning quality on fact-checking and fallacy detection. Uses the `claude-sonnet-4-5-20250514` model ID.

### System prompt

Instructs Claude to analyze the article and return structured JSON covering four sections: tone, fact_check, fallacies, overall_summary.

Key instructions:
- Tone: identify the dominant rhetorical/emotional tone, cite specific language choices as evidence
- Fact-check: identify verifiable factual claims, rate confidence (high/medium/low/unverifiable), explain reasoning. Be honest about limitations — "I cannot verify this" is a valid response.
- Fallacies: identify logical fallacies with the exact quote and explanation of why it's a fallacy. Only flag clear fallacies, not stylistic choices.
- Overall summary: one paragraph synthesizing findings

### Response format

```json
{
  "tone": {
    "summary": "Persuasive with urgency framing",
    "details": "The article uses repeated time-pressure language and emotional appeals...",
    "evidence": ["exact quote 1", "exact quote 2"]
  },
  "fact_check": {
    "summary": "3 claims identified, 1 potentially misleading",
    "claims": [
      {
        "claim": "The exact claim text from the article",
        "confidence": "high",
        "reasoning": "This is widely reported and consistent with..."
      },
      {
        "claim": "Another claim",
        "confidence": "unverifiable",
        "reasoning": "No named source provided, cannot independently verify"
      }
    ]
  },
  "fallacies": {
    "summary": "Appeal to authority detected",
    "items": [
      {
        "type": "Appeal to authority",
        "quote": "Experts say this is the worst crisis in decades",
        "explanation": "No specific experts are named or cited, making this an unsubstantiated appeal to authority"
      }
    ]
  },
  "overall_summary": "This article uses persuasive framing with urgency language. One of three factual claims could not be verified. An appeal to authority was detected. The core reporting appears factually grounded but the framing amplifies emotional impact beyond what the facts support."
}
```

### Token budget

- Input: ~30k chars article = ~8-10k tokens + ~500 token system prompt
- Output: max_tokens 4096 (structured analysis needs room)
- Timeout: 60 seconds

## Injected banner UI

### Placement

Injected as the first child of the `<article>`, `[role="main"]`, `<main>`, or `<body>` element (same root selection as extraction). Scrolls with the page content.

### Collapsed state (default)

A horizontal bar with:
- MindPrint label/icon on the left
- Tone pill (e.g., "Persuasive with urgency")
- Fact-check summary (e.g., "3 claims, 1 unverifiable")
- Fallacy count (e.g., "1 fallacy detected")
- Dismiss X button on the right

### Expanded state

Clicking a section header expands it below the bar:
- **Tone section:** summary paragraph, evidence quotes in styled blockquotes. If TRIBE data is available, a sub-section shows the emotion label, confidence, and top brain regions.
- **Fact-check section:** each claim as a card with confidence badge (green/yellow/orange/red for high/medium/low/unverifiable) and reasoning text.
- **Fallacies section:** each fallacy as a card with type label, quoted text, and explanation.
- **Overall summary:** the synthesized paragraph.

Only one section expanded at a time (accordion behavior) to keep the banner compact.

### Styling

- Uses MindPrint's existing CSS variables and color palette
- Respects `prefers-color-scheme: dark`
- Scoped under `.mindprint-banner` to avoid conflicts with host page
- Confidence badges reuse emotion pill colors: green (high), yellow (medium), orange (low), red (unverifiable)

### Dismissal

X button removes the banner from the DOM. Re-analyzing re-injects it.

## Error handling

| Scenario | Behavior |
|---|---|
| No Anthropic API key set | Popup shows "Set an Anthropic API key first" |
| Claude analysis fails (network/API) | Popup shows error with retry option |
| TRIBE fails but Claude succeeds | Banner shows Claude-only results, tone section notes "TRIBE data unavailable" |
| Both TRIBE and Claude fail | Popup shows error |
| Page has no article content | Popup shows "No article content found on this page" |
| Article exceeds 30k chars | Truncated with note in banner: "Article was truncated for analysis" |
| Claude returns malformed JSON | Popup shows "Analysis failed: could not parse results", offer retry |

## File changes

### `content.js`

- Add `extractArticle` message handler: broader element set, returns `{ title, imageUrl, html }`
- Add `injectBanner` message handler: receives analysis results, builds and injects the banner DOM
- Add banner rendering functions: collapsed bar, expandable sections, accordion behavior, dismiss
- Add `removeBanner` message handler: removes existing banner (for re-analysis)

### `background.js`

- Add `ANALYSIS_SYSTEM_PROMPT` constant with the structured analysis instructions
- Add `analyzeArticleWithClaude(articleHtml, title)` function: calls Claude Sonnet, parses JSON response
- Add `handleAnalyzeArticle(tabId)` orchestrator:
  1. Inject content script + CSS
  2. Send `extractArticle`, receive article HTML + title + image URL
  3. In parallel: call TRIBE `/classify` with title (if configured) + call Claude analysis
  4. Merge results
  5. Send `injectBanner` with merged results to content script
- Add `analyzeArticle` message handler in the router
- Add progress messages for each step

### `popup.html`

- Add "Analyze article" button and status area in the scan section

### `popup.js`

- Add analyze button element reference
- Add click handler: sends `{ type: "analyzeArticle" }`, shows progress, handles result
- Listen for `analyzeProgress` messages

### `popup.css`

- Style the analyze button (secondary style, below the scan button)

### `content.css`

- Add `.mindprint-banner` styles: bar layout, section headers, expandable content, accordion, evidence blockquotes, confidence badges, dismiss button, dark mode variants

### Backend

- No changes needed. The existing `/classify` endpoint handles single-headline TRIBE analysis.

## Out of scope

- Web search for fact verification (future enhancement)
- Image content analysis (TRIBE uses text only; image URL is extracted for potential future use)
- Saving/exporting analysis results
- Comparing analysis across multiple articles
- Auto-triggering analysis (always manual)

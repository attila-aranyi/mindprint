# Phase 1: Social Media Manipulation Analysis (X + Instagram)

## Summary

Rename "Analyze article" to "Analyze", add platform-specific extractors for X and Instagram that capture rich metadata, expand the Claude analysis prompt to detect engagement bait, emotional amplification, missing context, and source credibility, and add two new sidebar sections: Engagement Tactics and Missing Context.

## Platform detection

Content script detects the platform from `location.hostname`:
- `x.com` or `twitter.com` → X extractor
- `instagram.com` → Instagram extractor
- Everything else → existing generic article extractor (unchanged)

The `extractArticle` message handler routes to the correct extractor and includes a `platform` field in the response so the background script can build the appropriate prompt.

## X extractor

Targets X's DOM structure to extract:

- **Post text:** `[data-testid="tweetText"]`
- **Author name:** `[data-testid="User-Name"]` or the display name element near the post
- **Author handle:** `@handle` text
- **Verification status:** presence of verification badge SVG
- **Timestamp:** `time` element with `datetime` attribute
- **Engagement counts:** likes, retweets, replies, views from the action bar
- **Quoted tweet:** text content of any embedded quote tweet
- **Media presence:** whether the post contains images or video

Returns:
```json
{
  "platform": "x",
  "title": "Author @handle",
  "author": { "name": "Display Name", "handle": "@handle", "verified": true },
  "timestamp": "2026-04-22T12:00:00Z",
  "engagement": { "likes": 1200, "retweets": 340, "replies": 89, "views": 45000 },
  "quotedText": "Text of quoted tweet if present",
  "hasMedia": true,
  "html": "<p>Full post text...</p>"
}
```

## Instagram extractor

Targets Instagram's DOM structure to extract:

- **Caption text:** the post caption element
- **Author name:** author display name
- **Verification status:** verification badge presence
- **Like count:** from the likes element
- **Comment count:** from the comments section
- **Hashtags:** parsed from caption text (all `#tag` tokens)
- **Media type:** image, carousel, or reel (inferred from DOM structure)

Returns:
```json
{
  "platform": "instagram",
  "title": "Author post",
  "author": { "name": "Display Name", "verified": true },
  "engagement": { "likes": 856, "comments": 42 },
  "hashtags": ["tag1", "tag2"],
  "mediaType": "image",
  "html": "<p>Full caption text...</p>"
}
```

## Generic extractor (unchanged)

For all other sites, the existing `extractArticle` function runs unchanged. Its response gets a `platform: "article"` field added.

Returns:
```json
{
  "platform": "article",
  "title": "Article Title",
  "imageUrl": "https://...",
  "html": "<h1>...</h1><p>...</p>"
}
```

## Expanded analysis prompt

The background script builds the Claude system prompt dynamically based on the `platform` field.

### For social posts (X, Instagram)

The system prompt includes the existing tone/fact_check/fallacies instructions PLUS two additional sections:

**Engagement Tactics** — detect:
- Rage bait (inflammatory statements designed to provoke angry responses)
- Cliffhangers / curiosity gaps ("wait for it", "you won't believe")
- False controversies (framing mundane things as outrageous)
- Call-to-action manipulation ("share if you agree", "tag someone who...")
- Urgency cues ("BREAKING", "just now", "you NEED to see this")
- ALL CAPS and excessive punctuation for emotional amplification
- Hyperbolic language ("the worst ever", "literally destroying")

**Missing Context** — detect:
- No sources or links cited for factual claims
- Old content presented without date context
- Selective framing (only showing one side)
- Screenshots or quotes without attribution
- Hedging language that undermines stated confidence ("some people say", "reportedly")
- Unverified claims presented as established fact

The prompt also receives the structured metadata (author, verification, engagement counts, timestamp) so Claude can incorporate source credibility into its analysis. For example, an unverified account with extreme engagement ratios might signal amplification.

### For articles

Existing prompt unchanged. The two new sections are still requested but with article-appropriate guidance (engagement tactics are less relevant for news articles, but missing context very much applies).

## Claude response format

The response object adds two new top-level sections:

```json
{
  "tone": {
    "summary": "...",
    "details": "...",
    "evidence": ["...", "..."]
  },
  "fact_check": {
    "summary": "...",
    "claims": [
      { "claim": "...", "confidence": "high|medium|low|unverifiable", "reasoning": "..." }
    ]
  },
  "fallacies": {
    "summary": "...",
    "items": [
      { "type": "...", "quote": "...", "explanation": "..." }
    ]
  },
  "engagement_tactics": {
    "summary": "3 engagement tactics detected",
    "items": [
      {
        "type": "Rage bait",
        "quote": "exact text from the post",
        "explanation": "Why this is an engagement tactic"
      }
    ]
  },
  "missing_context": {
    "summary": "2 context gaps identified",
    "items": [
      {
        "type": "No source cited",
        "detail": "The post claims X but provides no source or link",
        "severity": "high|medium|low"
      }
    ]
  },
  "overall_summary": "..."
}
```

## Sidebar UI changes

### Renamed button
"Analyze article" → "Analyze" in popup.html and popup.js.

### New sections
Two new expandable accordion sections in the sidebar, after Logical Fallacies:

**Engagement Tactics:**
- Each tactic as a card with type label, quoted text, and explanation
- Pill in header shows summary (e.g., "3 tactics detected")
- Pill color: orange/amber

**Missing Context:**
- Each item as a card with type label, detail text, and severity badge
- Severity badges: high (red), medium (yellow), low (grey)
- Pill in header shows summary (e.g., "2 context gaps")
- Pill color: purple

### Platform metadata display
When analyzing a social post, the header area of the sidebar shows a small metadata line:
- X: "@handle \u00b7 verified \u00b7 1.2K likes \u00b7 340 retweets"
- Instagram: "author \u00b7 verified \u00b7 856 likes \u00b7 42 comments"

This gives quick context about the source without expanding any section.

## File changes

### `content.js`
- Add `extractXPost()` function with X-specific DOM selectors
- Add `extractInstagramPost()` function with Instagram-specific DOM selectors
- Update `extractArticle` message handler to detect hostname and route to correct extractor, adding `platform` field to generic extractor response
- Add `engagement_tactics` and `missing_context` sections to `buildBanner`
- Add metadata line rendering in the banner header for social platforms

### `background.js`
- Rename `analyzeArticle` message type to `analyzeContent` (update handler + router)
- Rename `handleAnalyzeArticle` to `handleAnalyzeContent`
- Add `buildAnalysisPrompt(platform, metadata)` function that returns platform-aware system prompt
- Update `analyzeArticleWithClaude` to accept platform metadata and use dynamic prompt
- Handle new response sections (`engagement_tactics`, `missing_context`)

### `popup.html`
- Rename button text from "Analyze article" to "Analyze"

### `popup.js`
- Update message type from `analyzeArticle` to `analyzeContent`
- Update progress message type from `analyzeProgress` (stays the same)

### `content.css`
- Add `.mpb-pill-engage` (orange/amber) and `.mpb-pill-context` (purple) pill styles
- Add `.mpb-severity-badge` styles with high/medium/low variants
- Add `.mpb-meta` style for the platform metadata line in the header
- Dark mode variants for all new styles

### Backend
- No changes needed.

## Error handling

| Scenario | Behavior |
|---|---|
| X/Instagram DOM structure changed | Extractor returns whatever it can find; empty fields are handled gracefully by the prompt |
| Post has no text content | Analysis runs on available metadata; Claude notes limited content |
| Platform not detected | Falls through to generic article extractor |
| New response sections missing from Claude output | Sidebar shows "No engagement tactics detected" / "No context gaps identified" |

## Out of scope

- Image/video content analysis (Phase 2 — needs Claude vision)
- Comment analysis and bot detection (Phase 3 — needs external APIs)
- Reddit, YouTube, TikTok support (future)
- Auto-detection of platform without user clicking Analyze

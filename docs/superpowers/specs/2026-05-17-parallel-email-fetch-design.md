# Design: Parallel Multi-Link Email Fetching

**Date:** 2026-05-17
**Status:** Approved
**Scope:** Improve email discovery by fetching all social links in parallel instead of stopping at the first one

---

## Problem

Phase 6 website email enrichment fetches only the **first** qualifying link from a channel's YouTube About page social links. If that link has no email, the pipeline gives up — even though a Linktree, personal website, or other link further down the list may have one.

---

## Solution

Replace the single-link sequential fetch with a parallel fetch of **all** qualifying links. Extract a `fetchEmailFromUrl()` helper. Fire all URLs simultaneously via `Promise.allSettled`. Take the first non-null email from results.

---

## Implementation

### File changed

`src/lib/outreach/fetch-channel-data.ts` — the website email block only (added in Phase 6). No other files change. No schema changes.

### `fetchEmailFromUrl(url: string): Promise<string | null>`

New helper function. Given a URL:

1. Start a 5-second `AbortController` timeout
2. `fetch(url, { signal, headers: { 'User-Agent': 'Mozilla/5.0' } })`
3. Get `html = await res.text()`
4. **Linktree special case:** if `url` contains `linktr.ee`, look for `<script id="__NEXT_DATA__">` in the HTML, parse the JSON blob, walk `props.pageProps.links[].url` for any entry starting with `mailto:`, extract the email address from it
5. **Generic fallback:** run `EMAIL_RE` regex on full HTML text (already matches plain email addresses and `mailto:href` attributes)
6. Return first email found, or `null`
7. Any error or timeout → return `null` (silent)

### Updated website email block

```typescript
// Collect all qualifying URLs (same SOCIAL_SKIP + redirect-unwrap rules as before)
const qualifyingUrls: string[] = [];
for (const link of primaryLinks) {
  const raw = (link as any)?.endpoint?.metadata?.url ?? '';
  if (!raw) continue;
  const target = unwrapYouTubeRedirect(raw);
  if (!target) continue;
  let hostname = '';
  try { hostname = new URL(target).hostname; } catch { continue; }
  if (SOCIAL_SKIP.has(hostname)) continue;
  qualifyingUrls.push(target);
}

// Fire all in parallel — each with its own timeout
const results = await Promise.allSettled(
  qualifyingUrls.map(url => fetchEmailFromUrl(url))
);

// Take first non-null result
websiteEmail = results
  .find((r): r is PromiseFulfilledResult<string> =>
    r.status === 'fulfilled' && r.value !== null
  )?.value ?? null;
```

### Timing

All link fetches start simultaneously. Worst case (no email found, all links timeout): 5 seconds — same as today's single-link worst case. Channels that find an email at any link complete as fast as that link responds.

---

## Out of Scope

- Instagram/Twitter bio scraping (require auth or are unreliable)
- Headless browser rendering
- Fetching URLs from the description text (not structured social links)
- Schema changes
- Changes to any file other than `fetch-channel-data.ts`

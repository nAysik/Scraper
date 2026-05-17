# Parallel Multi-Link Email Fetching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-link sequential website email fetch with a parallel fetch of all qualifying social links, including Linktree __NEXT_DATA__ JSON parsing.

**Architecture:** One file changes — `src/lib/outreach/fetch-channel-data.ts`. A new `fetchEmailFromUrl(url)` helper replaces the inline fetch block. The website email block collects all qualifying URLs from `primary_links`, fires them all with `Promise.allSettled`, and takes the first non-null result. Linktree pages get special treatment: the `__NEXT_DATA__` JSON blob embedded in the static HTML is parsed to extract `mailto:` links before falling back to the generic email regex.

**Tech Stack:** Native `fetch`, `AbortController`, `Promise.allSettled`, regex — no new dependencies.

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/lib/outreach/fetch-channel-data.ts` | Modify | Add `fetchEmailFromUrl` helper; replace single-link loop with parallel `Promise.allSettled` block |

---

## Task 1: Add `fetchEmailFromUrl` helper and update website email block

**Files:**
- Modify: `src/lib/outreach/fetch-channel-data.ts` (website email section, lines ~92–125)

- [ ] **Step 1: Read the current file**

Read `src/lib/outreach/fetch-channel-data.ts` in full before making any changes. The section to replace is the comment block starting `// Website email fallback (EML-01, EML-02, EML-03).` through the closing `}` of the outer try/catch (currently ends at line ~125 with `// silent — website fetch failure never blocks enrichment`).

- [ ] **Step 2: Add `fetchEmailFromUrl` helper before `fetchChannelDataOnce`**

Insert this function after the `unwrapYouTubeRedirect` function (around line 64) and before `async function fetchChannelDataOnce`:

```typescript
// Fetch a single URL and extract an email address from the response HTML.
// Linktree pages: parse __NEXT_DATA__ JSON for mailto: links (client-rendered content
// is embedded server-side in the Next.js hydration blob).
// Generic fallback: EMAIL_RE on the full HTML body (matches plain text and mailto: hrefs).
// Returns null on timeout, network error, or no email found.
async function fetchEmailFromUrl(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const html = await res.text();

    // Linktree: links (including mailto: buttons) are in the __NEXT_DATA__ JSON blob.
    if (url.includes('linktr.ee')) {
      const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nd) {
        try {
          const data = JSON.parse(nd[1]);
          const links: unknown[] = (data as any)?.props?.pageProps?.links ?? [];
          for (const link of links) {
            const linkUrl: string = (link as any)?.url ?? '';
            if (linkUrl.startsWith('mailto:')) {
              const email = linkUrl.slice('mailto:'.length).split('?')[0];
              if (EMAIL_RE.test(email)) return email;
            }
          }
        } catch {
          // JSON parse failed — fall through to generic regex
        }
      }
    }

    // Generic: EMAIL_RE matches plain addresses and mailto: href attributes.
    const match = html.match(EMAIL_RE);
    return match ? match[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

- [ ] **Step 3: Replace the website email block inside `fetchChannelDataOnce`**

Find the block starting with the comment `// Website email fallback (EML-01, EML-02, EML-03).` and ending with the outer `} catch { // silent ... }` (currently around lines 92–125). Replace the entire block with:

```typescript
  // Website email fallback — parallel fetch of all qualifying social links.
  // Collects every non-social-platform URL from primary_links, fires them all
  // simultaneously, takes the first that yields an email.
  // Linktree pages are handled via __NEXT_DATA__ JSON parsing inside fetchEmailFromUrl.
  // All failures are silent — this block never blocks enrichment.
  let websiteEmail: string | null = null;
  try {
    const primaryLinks: any[] = (about as any)?.primary_links ?? [];
    const qualifyingUrls: string[] = [];

    for (const link of primaryLinks) {
      const raw: string = (link as any)?.endpoint?.metadata?.url ?? '';
      if (!raw) continue;
      const target = unwrapYouTubeRedirect(raw);
      if (!target) continue;
      let hostname = '';
      try { hostname = new URL(target).hostname; } catch { continue; }
      if (SOCIAL_SKIP.has(hostname)) continue;
      qualifyingUrls.push(target);
    }

    if (qualifyingUrls.length > 0) {
      const results = await Promise.allSettled(
        qualifyingUrls.map(url => fetchEmailFromUrl(url)),
      );
      const found = results.find(
        (r): r is PromiseFulfilledResult<string> =>
          r.status === 'fulfilled' && r.value !== null,
      );
      websiteEmail = found?.value ?? null;
    }
  } catch {
    // silent — website fetch failure never blocks enrichment
  }
```

- [ ] **Step 4: TypeScript check**

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx.cmd tsc --noEmit
```

Expected: zero errors. If there are errors, fix them before proceeding.

- [ ] **Step 5: Verify the shape is intact**

Confirm `fetchChannelDataOnce` still returns `{ name, subscriberCount, description, videos, playlists, websiteEmail }` — the `websiteEmail` field must still be present in the return statement at the bottom of the function (around line 224). The return statement is unchanged; only the block that assigns `websiteEmail` changes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/outreach/fetch-channel-data.ts
git commit -m "feat(enrich): parallel multi-link email fetch with Linktree __NEXT_DATA__ support"
```

---

## Spec coverage check

| Spec requirement | Covered by |
|-----------------|-----------|
| Fire all qualifying URLs in parallel | Step 3 — `Promise.allSettled(qualifyingUrls.map(...))` |
| Same SOCIAL_SKIP rules as before | Step 3 — same `SOCIAL_SKIP.has(hostname)` guard |
| Same redirect unwrapping as before | Step 3 — same `unwrapYouTubeRedirect(raw)` call |
| 5-second timeout per fetch | Step 2 — `AbortController` with `setTimeout(..., 5000)` inside `fetchEmailFromUrl` |
| Linktree `__NEXT_DATA__` JSON parsing | Step 2 — `url.includes('linktr.ee')` branch |
| Generic email regex fallback | Step 2 — `html.match(EMAIL_RE)` at end of `fetchEmailFromUrl` |
| All failures silent | Step 2 — outer `catch { return null }` in helper; Step 3 — outer `catch {}` in block |
| No schema changes | Confirmed — only `fetch-channel-data.ts` changes |
| `websiteEmail` still returned | Step 5 — explicit verification of return statement |

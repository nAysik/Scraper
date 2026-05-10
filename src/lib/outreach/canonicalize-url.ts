// src/lib/outreach/canonicalize-url.ts
// Pure URL canonicalization for outreach paste input.
// Per CONTEXT.md "Claude's Discretion" + RESEARCH §8.
//
// Decision rule:
//   1. Trim whitespace
//   2. UC ID (e.g. UCxxxxxxxxxxxxxxxxxxxxxx) → return as-is (resolve-channel.ts fast-paths)
//   3. Bare @handle (e.g. @mkbhd) → wrap as 'https://youtube.com/@mkbhd'
//   4. Parseable URL with youtube.com / youtu.be / m.youtube.com host
//        → strip query+fragment, lowercase host, normalise to https
//        → preserve path (resolveURL handles /@handle, /channel/UC..., /c/legacy, /user/legacy)
//   5. Otherwise → null

const UC_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_RE = /^@[A-Za-z0-9._-]{3,30}$/;

export function canonicalizeUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  if (UC_ID_RE.test(s)) return s;
  if (HANDLE_RE.test(s)) return `https://youtube.com/${s}`;

  let url: URL;
  try {
    url = new URL(s.match(/^https?:\/\//) ? s : `https://${s}`);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== 'youtube.com' && host !== 'youtu.be' && host !== 'm.youtube.com') return null;

  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname || pathname === '/') return null;

  return `https://youtube.com${pathname}`;
}

// Launch Library 2 API client. Shared by the browser app and the Node build script.
// Docs: https://ll.thespacedevs.com/docs/  — free tier is ~15 requests/hour per IP.

export const LL2_BASE = 'https://ll.thespacedevs.com/2.3.0';
export const SPACEX_LSP_ID = 121;

export class ThrottledError extends Error {
  constructor(waitSec) {
    super(`Launch Library 2 rate limit reached; available again in ${waitSec}s`);
    this.name = 'ThrottledError';
    this.waitSec = waitSec;
  }
}

/**
 * Create an API client.
 * @param {object} o
 * @param {string} [o.base]        API root (override for testing / lldev)
 * @param {string} [o.token]       Optional LL2 API token (higher rate limits)
 * @param {number} [o.maxWaitSec]  When throttled, sleep and retry if the wait is <= this. 0 = throw immediately.
 * @param {number} [o.maxCalls]    Hard cap on requests for this run.
 * @param {(msg:string)=>void} [o.log]
 */
export function createApi({ base = LL2_BASE, token, maxWaitSec = 0, maxCalls = Infinity, log = () => {}, userAgent } = {}) {
  let calls = 0;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Token ${token}`;
  if (userAgent) headers['User-Agent'] = userAgent;

  async function get(path, params = {}) {
    const url = new URL(base.replace(/\/$/, '') + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, v);
    url.searchParams.set('format', 'json');
    for (let attempt = 0; attempt < 4; attempt++) {
      if (calls >= maxCalls) throw new ThrottledError(3600);
      calls++;
      log(`GET ${url.pathname}${url.search}`);
      let res;
      try {
        res = await fetch(url, { headers });
      } catch (e) {
        if (attempt < 3) { await sleep(2000 * (attempt + 1)); continue; }
        throw e;
      }
      if (res.status === 429) {
        let wait = 3600;
        try {
          const body = await res.json();
          const m = /(\d+)\s*second/.exec(body.detail || '');
          if (m) wait = Number(m[1]);
        } catch { /* ignore */ }
        if (wait <= maxWaitSec) {
          log(`Throttled — waiting ${wait}s`);
          await sleep((wait + 2) * 1000);
          continue;
        }
        throw new ThrottledError(wait);
      }
      if (res.status >= 500 && attempt < 3) { await sleep(3000 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`LL2 ${res.status} for ${url.pathname}`);
      return res.json();
    }
    throw new Error(`LL2 request failed: ${path}`);
  }

  /** Follow `next` links until exhausted. onPage lets callers checkpoint progress. */
  async function getAll(path, params = {}, onPage) {
    const out = [];
    let offset = Number(params.offset || 0);
    const limit = Number(params.limit || 100);
    for (;;) {
      const page = await get(path, { ...params, limit, offset });
      out.push(...page.results);
      offset += page.results.length;
      if (onPage) await onPage(page.results, offset, page.count);
      if (!page.next || page.results.length === 0) break;
    }
    return out;
  }

  return { get, getAll, get calls() { return calls; } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { AuthRequiredError, GoogleApiError } from './errors';
import type { AuthClient } from './client';

export interface GFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  /** Treat as JSON body — sets Content-Type and JSON.stringifies if not already a string. */
  json?: unknown;
}

// A 429 means Google's rate limiter rejected the request before it was ever
// processed (unlike a 5xx, which can happen mid-processing) — Google's own
// guidance is that it's always safe to retry a 429 with backoff, regardless
// of HTTP method, since nothing was applied server-side yet. We don't extend
// this to 5xx: a lost response to a non-idempotent write (append a row,
// insert a calendar event, delete-by-row-index) could have actually landed,
// and retrying blind could double-write or hit a since-shifted row.
const RATE_LIMIT_STATUS = 429;
const MAX_RATE_LIMIT_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prefer the server's own Retry-After hint when present; otherwise exponential backoff with jitter. */
function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const at = Date.parse(retryAfter);
    if (!Number.isNaN(at)) return Math.max(0, at - Date.now());
  }
  return 1000 * 2 ** attempt + Math.random() * 300;
}

/**
 * Wraps fetch with Google Bearer-token handling.
 * - Acquires the latest token from the AuthClient
 * - On 401, forces a silent renewal and retries once
 * - On 429 (rate limited), retries with backoff up to MAX_RATE_LIMIT_RETRIES times
 * - Throws AuthRequiredError if renewal fails
 * - Throws GoogleApiError on other non-2xx responses (including a 429 that
 *   still hasn't cleared after every retry)
 */
export async function gfetch(
  client: AuthClient,
  url: string,
  options: GFetchOptions = {},
): Promise<Response> {
  const { json, headers: rawHeaders, ...rest } = options;
  const headers: Record<string, string> = { ...rawHeaders };
  let body = rest.body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = typeof json === 'string' ? json : JSON.stringify(json);
  }

  const doRequest = async (forceRefresh: boolean): Promise<Response> => {
    const token = await client.ensureToken({ forceRefresh });
    return fetch(url, {
      ...rest,
      body,
      headers: {
        ...headers,
        Authorization: `Bearer ${token}`,
      },
    });
  };

  let response: Response;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await doRequest(false);
    } catch (err) {
      if (err instanceof AuthRequiredError) throw err;
      throw new Error(`Network error calling ${url}`, { cause: err });
    }

    if (response.status === 401) {
      try {
        response = await doRequest(true);
      } catch (err) {
        throw new AuthRequiredError('Token refresh failed after 401', { cause: err });
      }
      if (response.status === 401) {
        throw new AuthRequiredError('Still unauthenticated after refresh');
      }
    }

    if (response.status !== RATE_LIMIT_STATUS || attempt >= MAX_RATE_LIMIT_RETRIES) break;
    await sleep(retryDelayMs(response, attempt));
  }

  if (!response.ok) {
    let parsed: unknown;
    try {
      parsed = await response.clone().json();
    } catch {
      parsed = await response
        .clone()
        .text()
        .catch(() => null);
    }
    throw new GoogleApiError(response.status, response.statusText, url, parsed);
  }

  return response;
}

/** Convenience: gfetch + response.json() with type assertion. */
export async function gfetchJson<T>(
  client: AuthClient,
  url: string,
  options: GFetchOptions = {},
): Promise<T> {
  const res = await gfetch(client, url, options);
  return (await res.json()) as T;
}

import { AuthRequiredError, GoogleApiError } from './errors';
import type { AuthClient } from './client';

export interface GFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  /** Treat as JSON body — sets Content-Type and JSON.stringifies if not already a string. */
  json?: unknown;
}

/**
 * Wraps fetch with Google Bearer-token handling.
 * - Acquires the latest token from the AuthClient
 * - On 401, forces a silent renewal and retries once
 * - Throws AuthRequiredError if renewal fails
 * - Throws GoogleApiError on other non-2xx responses
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

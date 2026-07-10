import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gfetch, gfetchJson } from './fetcher';
import { AuthRequiredError, GoogleApiError } from './errors';
import type { AuthClient, AuthState } from './client';

function fakeClient(tokens: string[]): AuthClient {
  const queue = [...tokens];
  return {
    ensureToken: vi.fn(async () => {
      if (queue.length === 0) throw new AuthRequiredError();
      return queue.shift()!;
    }),
    signIn: vi.fn(async () => 'unused'),
    signOut: vi.fn(async () => undefined),
    subscribe: () => () => undefined,
    getState: (): AuthState => ({
      status: 'authenticated',
      accessToken: tokens[0] ?? null,
      expiresAt: null,
      userEmail: null,
      error: null,
    }),
  };
}

describe('gfetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds the Bearer header from ensureToken', async () => {
    const client = fakeClient(['initial-token']);
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    await gfetch(client, 'https://api.example/foo');
    const init = vi.mocked(globalThis.fetch).mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer initial-token');
  });

  it('retries with forceRefresh on 401 and succeeds', async () => {
    const client = fakeClient(['stale', 'fresh']);
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const res = await gfetch(client, 'https://api.example/foo');
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.ensureToken).toHaveBeenNthCalledWith(1, { forceRefresh: false });
    expect(client.ensureToken).toHaveBeenNthCalledWith(2, { forceRefresh: true });
  });

  it('throws AuthRequiredError when a 401 cannot be resolved by refresh', async () => {
    const client = fakeClient(['stale', 'fresh']);
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(gfetch(client, 'https://api.example/foo')).rejects.toBeInstanceOf(
      AuthRequiredError,
    );
  });

  it('throws GoogleApiError on non-2xx, non-401 responses', async () => {
    const client = fakeClient(['token']);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('{"error":"bad"}', { status: 400, statusText: 'Bad Request' }),
    );
    const err = await gfetch(client, 'https://api.example/foo').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GoogleApiError);
    expect((err as GoogleApiError).status).toBe(400);
  });

  it('sets Content-Type and stringifies json bodies', async () => {
    const client = fakeClient(['token']);
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response('{}', { status: 200 }));
    await gfetch(client, 'https://api.example/foo', {
      method: 'POST',
      json: { hello: 'world' },
    });
    const init = vi.mocked(globalThis.fetch).mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"hello":"world"}');
  });

  it('gfetchJson parses the response body', async () => {
    const client = fakeClient(['token']);
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ answer: 42 }), { status: 200 }),
    );
    const result = await gfetchJson<{ answer: number }>(client, 'https://api.example/foo');
    expect(result.answer).toBe(42);
  });

  it('retries on 429 with backoff and succeeds once the rate limit clears', async () => {
    vi.useFakeTimers();
    try {
      // Each retry calls ensureToken again (forceRefresh: false) — one token
      // per attempt this test expects to make.
      const client = fakeClient(['token', 'token', 'token']);
      const fetchMock = vi.mocked(globalThis.fetch);
      fetchMock
        .mockResolvedValueOnce(new Response('', { status: 429 }))
        .mockResolvedValueOnce(new Response('', { status: 429 }))
        .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

      const promise = gfetch(client, 'https://api.example/foo');
      await vi.advanceTimersByTimeAsync(20_000);
      const res = await promise;

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after the max retries and surfaces GoogleApiError(429)', async () => {
    vi.useFakeTimers();
    try {
      // 1 initial attempt + 4 retries = 5 ensureToken calls.
      const client = fakeClient(['token', 'token', 'token', 'token', 'token']);
      const fetchMock = vi.mocked(globalThis.fetch);
      fetchMock.mockResolvedValue(
        new Response('', { status: 429, statusText: 'Too Many Requests' }),
      );

      const promise = gfetch(client, 'https://api.example/foo').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(60_000);
      const err = await promise;

      expect(err).toBeInstanceOf(GoogleApiError);
      expect((err as GoogleApiError).status).toBe(429);
      // 1 initial attempt + 4 retries.
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honors a numeric Retry-After header instead of the default backoff', async () => {
    vi.useFakeTimers();
    try {
      const client = fakeClient(['token', 'token']);
      const fetchMock = vi.mocked(globalThis.fetch);
      fetchMock
        .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '5' } }))
        .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

      const promise = gfetch(client, 'https://api.example/foo');
      await vi.advanceTimersByTimeAsync(4_999);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(200);
      const res = await promise;
      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

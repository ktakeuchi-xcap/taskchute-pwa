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
});

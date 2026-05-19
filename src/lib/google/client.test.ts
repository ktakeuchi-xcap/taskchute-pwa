import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthClientForTesting } from './client';
import type {
  GisOAuth2,
  TokenClient,
  TokenClientError,
  TokenResponse,
} from './gisLoader';
import { AuthDeniedError, AuthRequiredError } from './errors';

interface MockGis {
  oauth2: GisOAuth2;
  triggerCallback: (response: TokenResponse) => void;
  triggerError: (err: TokenClientError) => void;
  requestCalls: Array<{ prompt?: string }>;
  revokeCalls: string[];
  initCalls: number;
}

function createMockGis(): MockGis {
  let cb: ((response: TokenResponse) => void) | null = null;
  let errCb: ((err: TokenClientError) => void) | null = null;
  const requestCalls: Array<{ prompt?: string }> = [];
  const revokeCalls: string[] = [];
  let initCalls = 0;
  const tokenClient: TokenClient = {
    requestAccessToken: (overrides) => {
      requestCalls.push(overrides ?? {});
    },
  };
  const oauth2: GisOAuth2 = {
    initTokenClient: ({ callback, error_callback }) => {
      initCalls += 1;
      cb = callback;
      errCb = error_callback ?? null;
      return tokenClient;
    },
    revoke: (token, done) => {
      revokeCalls.push(token);
      done();
    },
  };
  return {
    oauth2,
    triggerCallback: (response) => cb?.(response),
    triggerError: (err) => errCb?.(err),
    requestCalls,
    revokeCalls,
    get initCalls() {
      return initCalls;
    },
  } as MockGis;
}

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => Array.from(map.keys())[i] ?? null,
    removeItem: (k) => {
      map.delete(k);
    },
    setItem: (k, v) => {
      map.set(k, v);
    },
  };
}

function setup(opts: { preloadStorage?: Storage } = {}) {
  const gis = createMockGis();
  const storage = opts.preloadStorage ?? createMemoryStorage();
  const fetchUserInfo = vi.fn(async () => ({ email: 'me@example.com' }));
  const client = createAuthClientForTesting({
    clientId: 'test-client-id',
    storage,
    loadGis: async () => gis.oauth2,
    fetchUserInfo,
  });
  return { client, gis, storage, fetchUserInfo };
}

/** Wait until requestAccessToken has been called the expected number of times. */
async function waitForRequest(gis: MockGis, n: number) {
  await vi.waitFor(() => expect(gis.requestCalls.length).toBeGreaterThanOrEqual(n));
}

describe('GoogleAuthClient', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts unauthenticated when no token is stored', () => {
    const { client } = setup();
    expect(client.getState().status).toBe('unauthenticated');
  });

  it('restores a valid stored token on construction', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'taskchute.auth.token',
      JSON.stringify({
        accessToken: 'cached-token',
        expiresAt: Date.now() + 60 * 60 * 1000,
        userEmail: 'cached@example.com',
      }),
    );
    const { client } = setup({ preloadStorage: storage });
    expect(client.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'cached-token',
      userEmail: 'cached@example.com',
    });
  });

  it('ignores stored tokens that are about to expire', () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'taskchute.auth.token',
      JSON.stringify({
        accessToken: 'expiring-token',
        expiresAt: Date.now() + 5_000,
        userEmail: null,
      }),
    );
    const { client } = setup({ preloadStorage: storage });
    expect(client.getState().status).toBe('unauthenticated');
  });

  it('ensureToken returns the cached token without invoking GIS', async () => {
    const storage = createMemoryStorage();
    storage.setItem(
      'taskchute.auth.token',
      JSON.stringify({
        accessToken: 'cached-token',
        expiresAt: Date.now() + 60 * 60 * 1000,
        userEmail: null,
      }),
    );
    const { client, gis } = setup({ preloadStorage: storage });
    await expect(client.ensureToken()).resolves.toBe('cached-token');
    expect(gis.requestCalls).toHaveLength(0);
  });

  it('signIn requests an interactive token and resolves on success', async () => {
    const { client, gis, storage } = setup();
    const promise = client.signIn();
    await waitForRequest(gis, 1);
    expect(gis.requestCalls[0]).toEqual({ prompt: '' });
    gis.triggerCallback({ access_token: 'fresh-token', expires_in: 3600 });
    await expect(promise).resolves.toBe('fresh-token');
    expect(client.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 'fresh-token',
    });
    expect(storage.getItem('taskchute.auth.token')).toMatch(/fresh-token/);
  });

  it('ensureToken uses silent prompt and surfaces interaction_required as AuthRequiredError', async () => {
    const { client, gis } = setup();
    const promise = client.ensureToken({ forceRefresh: true });
    await waitForRequest(gis, 1);
    expect(gis.requestCalls[0]).toEqual({ prompt: 'none' });
    gis.triggerCallback({ error: 'interaction_required' });
    await expect(promise).rejects.toBeInstanceOf(AuthRequiredError);
    expect(client.getState().status).toBe('unauthenticated');
  });

  it('error_callback rejects in-flight signIn with AuthDeniedError', async () => {
    const { client, gis } = setup();
    const promise = client.signIn();
    await waitForRequest(gis, 1);
    gis.triggerError({ type: 'popup_closed' });
    await expect(promise).rejects.toBeInstanceOf(AuthDeniedError);
    expect(client.getState().status).toBe('unauthenticated');
  });

  it('deduplicates concurrent signIn calls', async () => {
    const { client, gis } = setup();
    const p1 = client.signIn();
    const p2 = client.signIn();
    await waitForRequest(gis, 1);
    expect(gis.requestCalls).toHaveLength(1);
    gis.triggerCallback({ access_token: 'shared-token', expires_in: 3600 });
    await expect(p1).resolves.toBe('shared-token');
    await expect(p2).resolves.toBe('shared-token');
  });

  it('signOut clears state, storage, and revokes the token', async () => {
    const { client, gis, storage } = setup();
    const promise = client.signIn();
    await waitForRequest(gis, 1);
    gis.triggerCallback({ access_token: 'token-to-revoke', expires_in: 3600 });
    await promise;
    await client.signOut();
    expect(client.getState().status).toBe('unauthenticated');
    expect(client.getState().accessToken).toBeNull();
    expect(storage.getItem('taskchute.auth.token')).toBeNull();
    expect(gis.revokeCalls).toEqual(['token-to-revoke']);
  });
});

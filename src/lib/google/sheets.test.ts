import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSheetsClient } from './sheets';
import type { AuthClient, AuthState } from './client';

function fakeClient(): AuthClient {
  return {
    ensureToken: vi.fn(async () => 'token'),
    signIn: vi.fn(async () => 'unused'),
    signOut: vi.fn(async () => undefined),
    subscribe: () => () => undefined,
    getState: (): AuthState => ({
      status: 'authenticated',
      accessToken: 'token',
      expiresAt: null,
      userEmail: null,
      error: null,
    }),
  };
}

describe('createSheetsClient.deleteRows', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('issues a single batchUpdate call with one deleteDimension request per row', async () => {
    const client = createSheetsClient(fakeClient());
    await client.deleteRows('sid', 42, [3, 7, 1]);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://sheets.googleapis.com/v4/spreadsheets/sid:batchUpdate');
    const body = JSON.parse(init!.body as string) as {
      requests: Array<{
        deleteDimension: { range: { sheetId: number; startIndex: number; endIndex: number } };
      }>;
    };
    // Sorted descending so earlier deletions in the same batch don't shift
    // the row indices still queued behind them.
    expect(body.requests.map((r) => r.deleteDimension.range.startIndex)).toEqual([7, 3, 1]);
    expect(
      body.requests.every(
        (r) => r.deleteDimension.range.endIndex === r.deleteDimension.range.startIndex + 1,
      ),
    ).toBe(true);
    expect(body.requests.every((r) => r.deleteDimension.range.sheetId === 42)).toBe(true);
  });

  it('does not call fetch at all for an empty row list', async () => {
    const client = createSheetsClient(fakeClient());
    await client.deleteRows('sid', 42, []);
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });
});

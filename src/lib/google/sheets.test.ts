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

describe('createSheetsClient.appendRows', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('anchors a bare sheet name at column A instead of letting Google guess where the table starts', async () => {
    // A bare sheet name for values.append lets Google's own "find the table"
    // heuristic pick the starting column from sheet content — confirmed in
    // production to drift over repeated calls (appends landing progressively
    // further right instead of at column A). Anchoring removes the ambiguity.
    const client = createSheetsClient(fakeClient());
    await client.appendRows('sid', 'TaskDB', [['a', 'b']]);

    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain(encodeURIComponent('TaskDB!A1') + ':append');
  });

  it('leaves an already-qualified range (containing "!") untouched', async () => {
    const client = createSheetsClient(fakeClient());
    await client.appendRows('sid', 'TaskDB!B2', [['a', 'b']]);

    const fetchMock = vi.mocked(globalThis.fetch);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toContain(encodeURIComponent('TaskDB!B2') + ':append');
  });
});

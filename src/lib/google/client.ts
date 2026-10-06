import {
  loadGoogleIdentityServices,
  type GisOAuth2,
  type TokenClient,
  type TokenResponse,
} from './gisLoader';
import { AuthDeniedError, AuthRequiredError } from './errors';

export type AuthStatus =
  | 'initializing'
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated'
  | 'error';

export interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  expiresAt: number | null;
  userEmail: string | null;
  error: string | null;
}

export interface AuthClient {
  ensureToken(options?: { forceRefresh?: boolean }): Promise<string>;
  signIn(): Promise<string>;
  signOut(): Promise<void>;
  subscribe(listener: (state: AuthState) => void): () => void;
  getState(): AuthState;
}

export const AUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  // 作業報告書のGoogleドキュメント自動作成（REQ-56）で使用。documentsはドキュメント本文の
  // 作成・編集、driveは生成したファイルをReportSettingsで指定した既存フォルダへ移動するため
  // （drive.fileスコープだと、アプリが作成していない既存フォルダへの移動が許可されないことがある）。
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive',
];

export function getScopes(): string {
  return AUTH_SCOPES.join(' ');
}

const TOKEN_STORAGE_KEY = 'taskchute.auth.token';
const TOKEN_EXPIRY_SAFETY_MS = 60_000;
// A silent (prompt:'none') token request normally resolves within ~1-2s via
// GIS's hidden iframe — but if the browser blocks that iframe's third-party
// cookie access (e.g. Safari/WebKit ITP having purged the Google session
// cookie after a long stretch of not using the app, or a Chrome
// third-party-cookie restriction), GIS can simply never call back at all
// (neither success nor error_callback) instead of cleanly failing. Without
// this timeout that leaves AuthGate's spinner spinning forever with no way
// to reach the manual sign-in button. 8s is generous slack over the normal
// round-trip while still failing fast enough to be noticed.
const SILENT_TOKEN_TIMEOUT_MS = 8_000;
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

interface StoredToken {
  accessToken: string;
  expiresAt: number;
  userEmail: string | null;
}

function readStored(storage: Storage): StoredToken | null {
  try {
    const raw = storage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredToken>;
    if (typeof parsed.accessToken !== 'string') return null;
    if (typeof parsed.expiresAt !== 'number') return null;
    if (parsed.expiresAt <= Date.now() + TOKEN_EXPIRY_SAFETY_MS) return null;
    return {
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
      userEmail: typeof parsed.userEmail === 'string' ? parsed.userEmail : null,
    };
  } catch {
    return null;
  }
}

function writeStored(storage: Storage, token: StoredToken | null): void {
  if (token) storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  else storage.removeItem(TOKEN_STORAGE_KEY);
}

interface ClientDeps {
  clientId: string;
  storage: Storage;
  loadGis: () => Promise<GisOAuth2>;
  fetchUserInfo?: (accessToken: string) => Promise<{ email: string | null }>;
  /** Test seam: override clock. */
  now?: () => number;
}

async function defaultFetchUserInfo(accessToken: string): Promise<{ email: string | null }> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { email: null };
    const data = (await res.json()) as { email?: string };
    return { email: data.email ?? null };
  } catch {
    return { email: null };
  }
}

class GoogleAuthClient implements AuthClient {
  private state: AuthState = {
    status: 'initializing',
    accessToken: null,
    expiresAt: null,
    userEmail: null,
    error: null,
  };
  private listeners = new Set<(s: AuthState) => void>();
  private tokenClient: TokenClient | null = null;
  private oauth2: GisOAuth2 | null = null;
  private initPromise: Promise<void> | null = null;
  private inflight: {
    promise: Promise<string>;
    resolve: (token: string) => void;
    reject: (err: Error) => void;
    interactive: boolean;
  } | null = null;
  private readonly now: () => number;
  private readonly deps: ClientDeps;

  constructor(deps: ClientDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => Date.now());
    // Restore from storage immediately so the UI can skip the login screen when possible.
    const restored = readStored(deps.storage);
    if (restored) {
      this.setState({
        status: 'authenticated',
        accessToken: restored.accessToken,
        expiresAt: restored.expiresAt,
        userEmail: restored.userEmail,
        error: null,
      });
    } else {
      this.setState({ status: 'unauthenticated', accessToken: null, expiresAt: null, error: null });
    }
  }

  getState(): AuthState {
    return this.state;
  }

  subscribe(listener: (s: AuthState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  ensureToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
    if (!options.forceRefresh) {
      const { accessToken, expiresAt } = this.state;
      if (accessToken && expiresAt && expiresAt > this.now() + TOKEN_EXPIRY_SAFETY_MS) {
        return Promise.resolve(accessToken);
      }
    }
    return this.requestToken({ interactive: false });
  }

  signIn(): Promise<string> {
    return this.requestToken({ interactive: true });
  }

  async signOut(): Promise<void> {
    const token = this.state.accessToken;
    writeStored(this.deps.storage, null);
    this.setState({
      status: 'unauthenticated',
      accessToken: null,
      expiresAt: null,
      userEmail: null,
      error: null,
    });
    if (token && this.oauth2?.revoke) {
      await new Promise<void>((resolve) => this.oauth2!.revoke(token, () => resolve()));
    }
  }

  private setState(partial: Partial<AuthState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.tokenClient) return;
    if (!this.initPromise) {
      this.initPromise = this.deps
        .loadGis()
        .then((oauth2) => {
          this.oauth2 = oauth2;
          this.tokenClient = oauth2.initTokenClient({
            client_id: this.deps.clientId,
            scope: getScopes(),
            callback: (response) => this.handleTokenResponse(response),
            error_callback: (err) =>
              this.handleTokenError(new AuthDeniedError(err.type ?? 'unknown', err.message)),
          });
        })
        .catch((err: unknown) => {
          this.initPromise = null;
          const message = err instanceof Error ? err.message : String(err);
          this.setState({ status: 'error', error: message });
          throw err;
        });
    }
    await this.initPromise;
  }

  private requestToken(options: { interactive: boolean }): Promise<string> {
    if (this.inflight) {
      // If a non-interactive request is in flight and the caller now wants interactive,
      // upgrade the request (next callback resolution will satisfy both).
      if (options.interactive && !this.inflight.interactive) {
        this.inflight.interactive = true;
      }
      return this.inflight.promise;
    }

    // Set inflight synchronously so concurrent callers share the same promise even
    // if the GIS script load hasn't resolved yet.
    let resolveFn!: (token: string) => void;
    let rejectFn!: (err: Error) => void;
    const promise = new Promise<string>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    const inflight = {
      promise,
      resolve: resolveFn,
      reject: rejectFn,
      interactive: options.interactive,
    };
    this.inflight = inflight;
    this.setState({ status: 'authenticating', error: null });

    // Silent (non-interactive) requests can go unanswered forever instead of
    // cleanly erroring (see SILENT_TOKEN_TIMEOUT_MS) — this covers the whole
    // attempt (GIS script load included), not just the requestAccessToken
    // call itself, since a hung script load would hang just as silently.
    let timeoutId: number | null = null;
    if (!options.interactive) {
      timeoutId = window.setTimeout(() => {
        if (this.inflight !== inflight) return; // already settled by a real callback
        this.handleTokenResponse({ error: 'login_required' });
      }, SILENT_TOKEN_TIMEOUT_MS);
      // .finally()'s returned promise adopts promise's rejection — caught
      // here (not propagated) since this chain exists purely for the timer
      // cleanup side effect; the original `promise` is still returned to
      // the real caller below for them to handle.
      void promise
        .finally(() => {
          if (timeoutId != null) window.clearTimeout(timeoutId);
        })
        .catch(() => {});
    }

    void (async () => {
      try {
        await this.ensureInitialized();
        if (!this.tokenClient) throw new Error('Token client not initialized');
        if (this.inflight !== inflight) return; // signOut, or the silent timeout already fired
        this.tokenClient.requestAccessToken({ prompt: inflight.interactive ? '' : 'none' });
      } catch (err) {
        const current = this.inflight;
        this.inflight = null;
        const error = err instanceof Error ? err : new Error(String(err));
        this.setState({ status: 'error', error: error.message });
        current?.reject(error);
      }
    })();

    return promise;
  }

  private handleTokenResponse(response: TokenResponse): void {
    const inflight = this.inflight;
    this.inflight = null;
    if (response.error || !response.access_token) {
      const reason = response.error ?? 'token_acquisition_failed';
      const error =
        reason === 'interaction_required' ||
        reason === 'login_required' ||
        reason === 'consent_required'
          ? new AuthRequiredError(reason)
          : new AuthDeniedError(reason, response.error_description ?? reason);
      // Silent failure is expected — surface as unauthenticated rather than 'error'.
      this.setState({
        status: error instanceof AuthRequiredError ? 'unauthenticated' : 'error',
        accessToken: null,
        expiresAt: null,
        error: error.message,
      });
      inflight?.reject(error);
      return;
    }
    const expiresAt = this.now() + (response.expires_in ?? 3600) * 1000;
    this.setState({
      status: 'authenticated',
      accessToken: response.access_token,
      expiresAt,
      error: null,
    });
    writeStored(this.deps.storage, {
      accessToken: response.access_token,
      expiresAt,
      userEmail: this.state.userEmail,
    });
    // Fire-and-forget userinfo enrichment.
    const fetchUserInfo = this.deps.fetchUserInfo ?? defaultFetchUserInfo;
    void fetchUserInfo(response.access_token).then(({ email }) => {
      if (email && this.state.accessToken === response.access_token) {
        this.setState({ userEmail: email });
        writeStored(this.deps.storage, {
          accessToken: response.access_token!,
          expiresAt,
          userEmail: email,
        });
      }
    });
    inflight?.resolve(response.access_token);
  }

  private handleTokenError(err: AuthDeniedError): void {
    const inflight = this.inflight;
    this.inflight = null;
    this.setState({ status: 'unauthenticated', error: err.message });
    inflight?.reject(err);
  }
}

export function createAuthClient(clientId: string): AuthClient {
  if (typeof window === 'undefined') {
    throw new Error('createAuthClient must be called in the browser');
  }
  return new GoogleAuthClient({
    clientId,
    // localStorage (not sessionStorage) so closing/reopening the tab or PWA
    // doesn't force a fresh login — the token still expires on its own after
    // ~1 hour (expiresAt, checked in ensureToken/readStored) regardless of
    // which storage holds it, so this only removes the "cleared on tab
    // close" behavior, not the token's actual lifetime.
    storage: window.localStorage,
    loadGis: loadGoogleIdentityServices,
  });
}

/** Internal: lets tests inject deps without going through the global window/GIS. */
export function createAuthClientForTesting(deps: ClientDeps): AuthClient {
  return new GoogleAuthClient(deps);
}

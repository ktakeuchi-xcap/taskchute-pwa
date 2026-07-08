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
];

export function getScopes(): string {
  return AUTH_SCOPES.join(' ');
}

const TOKEN_STORAGE_KEY = 'taskchute.auth.token';
const TOKEN_EXPIRY_SAFETY_MS = 60_000;
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
    this.inflight = {
      promise,
      resolve: resolveFn,
      reject: rejectFn,
      interactive: options.interactive,
    };
    this.setState({ status: 'authenticating', error: null });

    void (async () => {
      try {
        await this.ensureInitialized();
        if (!this.tokenClient) throw new Error('Token client not initialized');
        const inflight = this.inflight;
        if (!inflight) return; // signOut or another caller cleared us
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
    storage: window.sessionStorage,
    loadGis: loadGoogleIdentityServices,
  });
}

/** Internal: lets tests inject deps without going through the global window/GIS. */
export function createAuthClientForTesting(deps: ClientDeps): AuthClient {
  return new GoogleAuthClient(deps);
}

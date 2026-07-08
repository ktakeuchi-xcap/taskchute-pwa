const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

let pendingLoad: Promise<GisOAuth2> | null = null;

export interface GisOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: TokenClientError) => void;
    prompt?: string;
  }): TokenClient;
  revoke(accessToken: string, callback: () => void): void;
  hasGrantedAllScopes?(tokenResponse: TokenResponse, ...scopes: string[]): boolean;
}

export interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string; hint?: string; state?: string }): void;
}

export interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export interface TokenClientError {
  type?: string;
  message?: string;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GisOAuth2;
      };
    };
  }
}

/**
 * Lazily injects the Google Identity Services script and resolves with the
 * `google.accounts.oauth2` namespace. Safe to call repeatedly — only one
 * script tag is ever inserted.
 */
export function loadGoogleIdentityServices(): Promise<GisOAuth2> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Identity Services requires a browser environment'));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve(window.google.accounts.oauth2);
  }
  if (pendingLoad) return pendingLoad;

  pendingLoad = new Promise<GisOAuth2>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`);
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    const settle = (): void => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2) resolve(oauth2);
      else reject(new Error('GIS loaded but google.accounts.oauth2 is unavailable'));
    };
    if (existing && window.google?.accounts?.oauth2) {
      settle();
      return;
    }
    script.addEventListener('load', settle, { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error('Failed to load Google Identity Services')),
      { once: true },
    );
  }).catch((err: unknown) => {
    pendingLoad = null;
    throw err instanceof Error ? err : new Error(String(err));
  });

  return pendingLoad;
}

/** Test-only: forget cached load promise so subsequent calls re-inject the script. */
export function __resetGisLoaderForTests(): void {
  pendingLoad = null;
}

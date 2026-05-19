/**
 * Google Identity Services (GIS) wrapper.
 * Provides access-token acquisition with silent renewal.
 *
 * Implementation arrives in M2 (auth phase). This module currently exports
 * the contract so feature code can be written against it.
 */

export interface AuthState {
  accessToken: string | null;
  expiresAt: number | null;
  userEmail: string | null;
}

export interface AuthClient {
  /** Request an access token (silent if possible, prompts on failure). */
  ensureToken(): Promise<string>;
  /** Force an interactive sign-in. */
  signIn(): Promise<string>;
  /** Drop the in-memory token; doesn't revoke Google-side. */
  signOut(): void;
  /** Subscribe to auth state changes. */
  subscribe(listener: (state: AuthState) => void): () => void;
  /** Snapshot of current state. */
  getState(): AuthState;
}

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
].join(' ');

export function getScopes(): string {
  return SCOPES;
}

// Real implementation lands in M2.
export function createAuthClient(_clientId: string): AuthClient {
  throw new Error('AuthClient is not yet implemented (M2).');
}

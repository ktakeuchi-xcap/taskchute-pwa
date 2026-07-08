import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createAuthClient, type AuthClient, type AuthState } from '@/lib/google/client';
import { env } from '@/lib/env';
import { AuthContext, type AuthContextValue } from './authContext';

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Boots the Google Auth client and broadcasts state to the React tree.
 * Performs an opportunistic silent sign-in on mount.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [client] = useState<AuthClient | null>(() => {
    if (!env.googleOAuthClientId) {
      // No client ID configured — surface a missing-config state instead of crashing.
      return null;
    }
    try {
      return createAuthClient(env.googleOAuthClientId);
    } catch (err) {
      console.error('[auth] Failed to create AuthClient:', err);
      return null;
    }
  });

  const [state, setState] = useState<AuthState>(
    () =>
      client?.getState() ?? {
        status: 'error',
        accessToken: null,
        expiresAt: null,
        userEmail: null,
        error:
          'VITE_GOOGLE_OAUTH_CLIENT_ID is not configured. See docs/07_認証セットアップガイド.md',
      },
  );

  useEffect(() => {
    if (!client) return;
    const unsubscribe = client.subscribe(setState);
    // Attempt silent renewal on mount. We don't care if it fails — the gate UI
    // will offer a sign-in button if so.
    void client.ensureToken().catch(() => undefined);
    return unsubscribe;
  }, [client]);

  const value = useMemo<AuthContextValue>(() => ({ client, state }), [client, state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

import { useMemo, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue } from './authContext';

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Stub provider. Real GIS wiring lands in M2.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const value = useMemo<AuthContextValue>(
    () => ({
      client: null,
      state: { accessToken: null, expiresAt: null, userEmail: null },
    }),
    [],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

import { createContext } from 'react';
import type { AuthClient, AuthState } from '@/lib/google/client';

export interface AuthContextValue {
  client: AuthClient | null;
  state: AuthState;
}

export const AuthContext = createContext<AuthContextValue>({
  client: null,
  state: { accessToken: null, expiresAt: null, userEmail: null },
});

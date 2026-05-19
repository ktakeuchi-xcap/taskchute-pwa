import { createContext } from 'react';
import type { AuthClient, AuthState } from '@/lib/google/client';

export interface AuthContextValue {
  client: AuthClient | null;
  state: AuthState;
}

const INITIAL_STATE: AuthState = {
  status: 'initializing',
  accessToken: null,
  expiresAt: null,
  userEmail: null,
  error: null,
};

export const AuthContext = createContext<AuthContextValue>({
  client: null,
  state: INITIAL_STATE,
});

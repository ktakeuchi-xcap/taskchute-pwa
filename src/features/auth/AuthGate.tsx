import type { ReactNode } from 'react';
import { useAuth } from './useAuth';
import { LoginScreen } from './LoginScreen';

interface AuthGateProps {
  children: ReactNode;
}

function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-muted/40">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
        />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

/**
 * Renders children only when the user is authenticated.
 * Shows a spinner during silent renewal, the LoginScreen otherwise.
 */
export function AuthGate({ children }: AuthGateProps) {
  const { state } = useAuth();

  if (state.status === 'initializing' || state.status === 'authenticating') {
    return <FullPageSpinner label="Google アカウントに接続しています…" />;
  }
  if (state.status === 'authenticated' && state.accessToken) {
    return <>{children}</>;
  }
  return <LoginScreen />;
}

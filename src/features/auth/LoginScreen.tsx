import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from './useAuth';

export function LoginScreen() {
  const { client, state } = useAuth();
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!client) return;
    setPending(true);
    setLocalError(null);
    try {
      await client.signIn();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  };

  const configMissing = !client;
  const errorMessage = configMissing
    ? state.error
    : localError ?? (state.status === 'error' ? state.error : null);

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-muted/40 px-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-6 shadow-lg">
        <div className="text-center">
          <div className="text-3xl">⚡</div>
          <h1 className="mt-2 text-xl font-bold tracking-tight">Taskchute</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Google アカウントでサインインして始めましょう
          </p>
        </div>

        {configMissing ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            OAuth クライアントIDが未設定です。
            <br />
            <code className="font-mono">.env.local</code> に{' '}
            <code className="font-mono">VITE_GOOGLE_OAUTH_CLIENT_ID</code> を設定してください。
            <br />
            手順: <code className="font-mono">docs/07_認証セットアップガイド.md</code>
          </div>
        ) : (
          <>
            <Button
              type="button"
              className="w-full"
              size="lg"
              onClick={handleSignIn}
              disabled={pending || state.status === 'authenticating'}
            >
              {pending || state.status === 'authenticating' ? 'サインイン中…' : 'Google でサインイン'}
            </Button>
            {errorMessage ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                {errorMessage}
              </div>
            ) : null}
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              Spreadsheets / Calendar / Tasks のスコープを要求します。
              <br />
              アクセストークンはこのタブが開いている間のみ保管されます。
            </p>
          </>
        )}
      </div>
    </div>
  );
}

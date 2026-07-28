import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/useAuth';

/** Shows the signed-in Google account and lets the user sign out. */
export function AccountSection() {
  const { client, state } = useAuth();
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (!client) return;
    if (!window.confirm('サインアウトしますか？')) return;
    setIsSigningOut(true);
    try {
      await client.signOut();
      // Drop every cached query — otherwise the next account to sign in
      // would briefly see the previous account's tasks/categories/etc.
      queryClient.clear();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {state.userEmail ? (
        <p className="mb-3 text-sm text-muted-foreground">
          サインイン中：<span className="font-medium text-foreground">{state.userEmail}</span>
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleSignOut}
        disabled={!client || isSigningOut}
      >
        {isSigningOut ? 'サインアウト中…' : 'サインアウト'}
      </Button>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { appSignOut } from '@/app/app/account/actions';
import { useToast, useConfirm } from '@/components/app/Ui';

/**
 * Sign out of this device.
 *
 * Confirmed rather than immediate. On an installed app the session lasts
 * thirty days, so signing out by accident means finding the password again —
 * and a stray tap at the bottom of a scrolling list is exactly how that
 * happens.
 */
export function SignOutButton() {
  const router = useRouter();
  const toast = useToast();
  const { confirm, confirmNode } = useConfirm();
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn gh btn-full"
        disabled={busy}
        onClick={async () => {
          const ok = await confirm(
            'Sign out of this phone?',
            'You will need your password or Face ID to get back in. Your passkey stays registered, so Face ID will still work.',
            'Sign out',
          );
          if (!ok) return;
          setBusy(true);
          try {
            await appSignOut();
            router.replace('/app/login');
          } catch {
            toast('Could not sign out. Check your connection.', 'bad');
            setBusy(false);
          }
        }}
      >
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
      {confirmNode}
    </>
  );
}

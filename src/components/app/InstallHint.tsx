'use client';

import { useEffect, useState } from 'react';

/**
 * Tells Samir how to install the dashboard, and only while it is not installed.
 *
 * iOS gives no `beforeinstallprompt` event and no install button — Safari's
 * "Add to Home Screen" is buried two taps into the Share sheet and there is no
 * API to open it. So the only honest thing an iOS web app can do is say where
 * the option is, once, and then get out of the way.
 *
 * Two of the app's headline features are gated behind being installed: push
 * notifications simply do not fire in iOS Safari, and the full-screen chrome
 * only appears from the home-screen icon. That makes this a functional
 * instruction rather than an upsell, which is why it says what is missing
 * rather than "install for a better experience".
 */
export function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    /* `display-mode: standalone` is the cross-browser signal. `navigator.standalone`
       is the older iOS-only one, and some iOS versions still report only that,
       so both are checked. */
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    if (standalone) return;

    // Dismissal is remembered, because a hint that reappears every morning is
    // no longer a hint.
    if (localStorage.getItem('sb-install-hint') === 'off') return;

    setShow(true);
  }, []);

  if (!show) return null;

  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);

  return (
    <div className="note">
      <b style={{ color: 'var(--text)' }}>Add this to your Home Screen</b>
      <br />
      {isIOS ? (
        <>
          Tap the Share button in Safari, then <b>Add to Home Screen</b>. Until you do, iOS will
          not deliver order alerts and the app keeps Safari&rsquo;s address bar.
        </>
      ) : (
        <>
          Use your browser&rsquo;s <b>Install app</b> option. Until you do, alerts are not
          delivered while the app is closed.
        </>
      )}
      <br />
      <button
        type="button"
        className="btn gh btn-sm"
        style={{ marginTop: '.7rem' }}
        onClick={() => {
          localStorage.setItem('sb-install-hint', 'off');
          setShow(false);
        }}
      >
        Don&rsquo;t show this again
      </button>
    </div>
  );
}

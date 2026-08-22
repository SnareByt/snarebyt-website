/**
 * Decides whether the entrance plays, before the first paint.
 *
 * This has to run synchronously in the document, ahead of React, because the
 * alternative is a visible flash in one direction or the other — the curtain
 * appearing a beat after the site for a first-time visitor, or the curtain
 * appearing at all for someone who has already seen it this session.
 *
 * It sets one class on <html> and nothing else. Everything it reads can fail
 * safely: private browsing throws on sessionStorage, an old browser has no
 * matchMedia, and either way the answer is "do not play", which leaves the
 * ordinary site.
 *
 * `motion` is the site's own toggle from the Design screen, passed in rather
 * than read from the DOM so the decision is made in one place.
 */
export function IntroScript({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  const code = `(function(){try{
    if (sessionStorage.getItem('sb_intro')) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('intro-play');
  }catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

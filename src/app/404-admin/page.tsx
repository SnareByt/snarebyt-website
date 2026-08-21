import { notFound } from 'next/navigation';

/**
 * What a signed-out visitor gets for any admin URL.
 *
 * The middleware rewrites here rather than redirecting to a login page,
 * because a redirect is a confirmation: it tells a scanner that /admin is real
 * and hands it a form. This route exists only to call notFound(), so the
 * response is the site's ordinary 404 with an ordinary 404 status — the same
 * answer as a path that was never built.
 *
 * Not linked from anywhere, and harmless if reached directly.
 */
export default function AdminNotFound() {
  notFound();
}

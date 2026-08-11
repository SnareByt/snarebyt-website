import { NextResponse, type NextRequest } from 'next/server';

/**
 * Where the buyer's browser comes back from SSLCOMMERZ.
 *
 * The gateway sends a form POST, and it carries tran_id in the body rather
 * than the query string. A page component only reads searchParams, so posting
 * straight at /checkout/success would land on a page that could not identify
 * the transaction and would tell a paying customer we had no record of it.
 *
 * So the gateway is pointed here instead: read the transaction id from
 * wherever it arrived, then 303 to the real page as a GET. That also leaves
 * the buyer on a URL they can refresh or bookmark without re-submitting a POST.
 *
 * This decides NOTHING about the payment. Whether an order is paid is settled
 * by the IPN route, server to server, after re-validating with SSLCOMMERZ.
 */

// An allow-list, not a redirect parameter. Without it this endpoint would
// forward a browser anywhere the query string asked it to.
const DESTINATIONS: Record<string, string> = {
  success: '/checkout/success',
  failed: '/checkout/failed',
  cancelled: '/checkout/cancelled',
};

async function handle(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to') ?? '';
  const path = DESTINATIONS[to] ?? '/checkout/failed';

  let tranId = req.nextUrl.searchParams.get('tran_id') ?? '';
  if (req.method === 'POST') {
    try {
      const form = await req.formData();
      tranId = String(form.get('tran_id') ?? tranId);
    } catch {
      // A return with no readable body still deserves the right page.
    }
  }

  const url = new URL(path, req.nextUrl.origin);
  if (tranId) url.searchParams.set('tran_id', tranId);

  // 303 so the browser follows with GET rather than repeating the POST.
  return NextResponse.redirect(url, 303);
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req); }

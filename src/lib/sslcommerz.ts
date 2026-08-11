import 'server-only';

/**
 * SSLCOMMERZ session initiation.
 *
 * Sandbox and live differ only by host. The store password is read from the
 * environment at call time and never reaches the browser — the browser only
 * ever receives the GatewayPageURL that comes back.
 */
const SANDBOX = process.env.SSLC_SANDBOX !== 'false';

const SESSION_URL = SANDBOX
  ? 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php'
  : 'https://securepay.sslcommerz.com/gwprocess/v4/api.php';

/**
 * Whether the gateway can be used at all.
 *
 * Pages ask this before promising a buyer they can pay on the site. Without it
 * the copy would advertise card and mobile-wallet checkout on a deployment
 * where the credentials were never added, and the button would simply be
 * missing under a paragraph saying it exists.
 */
export function paymentsConfigured(): boolean {
  return Boolean(process.env.SSLC_STORE_ID && process.env.SSLC_STORE_PASSWORD);
}

export type SessionInput = {
  tranId: string;
  amountBdt: number;
  customer: { name: string; email: string; phone: string; country?: string | null };
  baseUrl: string;
  itemCount: number;
};

export type SessionResult =
  | { ok: true; gatewayUrl: string; sessionKey: string; raw: unknown }
  | { ok: false; error: string; raw: unknown };

export async function createPaymentSession(input: SessionInput): Promise<SessionResult> {
  const storeId = process.env.SSLC_STORE_ID;
  const storePasswd = process.env.SSLC_STORE_PASSWORD;
  if (!storeId || !storePasswd) {
    return { ok: false, error: 'SSLCOMMERZ credentials are not configured on the server.', raw: null };
  }

  const body = new URLSearchParams({
    store_id: storeId,
    store_passwd: storePasswd,
    // Whole taka. Every price in this system is an integer of BDT, and the
    // gateway is asked for exactly the figure we recorded on the Payment row —
    // the IPN later refuses anything that does not match it.
    total_amount: input.amountBdt.toFixed(2),
    currency: 'BDT',
    tran_id: input.tranId,

    // Via the return handler, not straight at the pages: the gateway sends a
    // form POST and carries tran_id in the body, which a page cannot read.
    success_url: `${input.baseUrl}/api/payments/sslcommerz/return?to=success`,
    fail_url: `${input.baseUrl}/api/payments/sslcommerz/return?to=failed`,
    cancel_url: `${input.baseUrl}/api/payments/sslcommerz/return?to=cancelled`,
    ipn_url: `${input.baseUrl}/api/payments/sslcommerz/ipn`,

    cus_name: input.customer.name,
    cus_email: input.customer.email,
    cus_phone: input.customer.phone,
    cus_add1: 'N/A',
    cus_city: 'N/A',
    cus_country: input.customer.country || 'Bangladesh',

    // Digital goods: nothing is posted, so shipping is explicitly off.
    shipping_method: 'NO',
    num_of_item: String(input.itemCount),
    product_name: 'Beat licence',
    product_category: 'Digital goods',
    product_profile: 'digital-goods',
  });

  try {
    const res = await fetch(SESSION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
    const raw = (await res.json()) as Record<string, unknown>;

    if (raw.status === 'SUCCESS' && typeof raw.GatewayPageURL === 'string') {
      return {
        ok: true,
        gatewayUrl: raw.GatewayPageURL,
        sessionKey: String(raw.sessionkey ?? ''),
        raw,
      };
    }
    return {
      ok: false,
      error: String(raw.failedreason || raw.status || 'The payment gateway refused the request.'),
      raw,
    };
  } catch (e) {
    return { ok: false, error: `Could not reach the payment gateway: ${String(e)}`, raw: null };
  }
}

export const isSandbox = () => SANDBOX;

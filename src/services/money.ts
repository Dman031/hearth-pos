// src/services/money.ts
//
// The Money sheet's client for the hearth-network /money/* JSON endpoints
// (balance + refund). Mirrors the stripe.ts house style: discriminated
// results so callers branch without try/catch — these paths are
// vendor-initiated, so failures must surface as visible states, never a
// silent no-op.
//
// AUTH — the SECOND token plane (CLAUDE.md "Token planes — hearth-network
// Worker", ruled 2026-08-12): "The iOS app forwards its EXISTING Supabase
// access token as `Authorization: Bearer`. The Worker validates it with
// `auth.getUser(jwt)` … and binds the entity server-side via the unique
// `entities.user_id`." No second sign-in, no new session — the token comes
// from supabase.auth.getSession() and nothing else identifies the caller.
//
// A 401 from the Worker is an EXPIRED/INVALID SESSION, not a money error —
// callers surface it as "sign in again", distinct from every other failure.
//
// Settled history is NOT fetched here — per the same standing fact, the app
// calls the get_my_settled_payments RPC directly with its own session
// (src/hooks/useSettledPayments.ts). A Worker settled endpoint deliberately
// does not exist.

import { supabase } from './supabase';

/** hearth-network Worker base — the final domain, live (swapped 2026-08-13). */
const NETWORK_URL =
  process.env.EXPO_PUBLIC_NETWORK_URL ?? 'https://mcp.teleoplexy.ai';

export interface MoneyAmount {
  amount_cents: number;
  currency: string;
}

/** GET /money/balance — the Worker's two honest shapes. */
export type MoneyBalance =
  | { payments_ready: false }
  | {
      payments_ready: true;
      available: MoneyAmount[];
      pending: MoneyAmount[];
      /** "YYYY-MM-DD" calendar date, or null when no payout exists yet. */
      next_payout_date: string | null;
      /** Payout cadence ("daily"…) — the no-payouts-yet fallback fact. */
      payout_schedule: string | null;
    };

export type BalanceResult =
  | { ok: true; balance: MoneyBalance }
  | { ok: false; reason: BalanceFailure };

export type BalanceFailure =
  | 'unauthenticated' // no local session at all — vendor must be signed in
  | 'session_expired' // Worker 401: the forwarded token no longer validates
  | 'unavailable'; // network/5xx/malformed payload

export type RefundResult =
  | { ok: true; outcome: 'refunded' | 'already_refunded' }
  | { ok: false; reason: RefundFailure };

export type RefundFailure =
  | 'unauthenticated'
  | 'session_expired'
  | 'not_refundable' // Worker 404/409 — not this vendor's settled charge
  | 'failed'; // Stripe/network failure — Worker guarantees nothing changed

/** The signed-in session's access token, or null. Auto-refresh is on
 * (services/supabase.ts), so getSession() returns a live token in the
 * normal case; a Worker 401 after this means genuinely expired/revoked. */
async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function isMoneyAmountArray(v: unknown): v is MoneyAmount[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as MoneyAmount).amount_cents === 'number' &&
        typeof (e as MoneyAmount).currency === 'string',
    )
  );
}

/** Validates the Worker's balance JSON before we trust it (stripe.ts habit). */
function parseBalancePayload(data: unknown): MoneyBalance | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.payments_ready === false) return { payments_ready: false };
  if (d.payments_ready !== true) return null;
  if (!isMoneyAmountArray(d.available) || !isMoneyAmountArray(d.pending)) return null;
  const nextPayout = d.next_payout_date;
  const schedule = d.payout_schedule;
  if (nextPayout !== null && typeof nextPayout !== 'string') return null;
  if (schedule !== null && typeof schedule !== 'string') return null;
  return {
    payments_ready: true,
    available: d.available,
    pending: d.pending,
    next_payout_date: nextPayout,
    payout_schedule: schedule,
  };
}

/** Available/pending balance + next payout, connected-account scoped. */
export async function getMoneyBalance(): Promise<BalanceResult> {
  const token = await accessToken();
  if (!token) return { ok: false, reason: 'unauthenticated' };
  try {
    const res = await fetch(`${NETWORK_URL}/money/balance`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return { ok: false, reason: 'session_expired' };
    if (!res.ok) {
      console.warn('[money] balance fetch failed', { status: res.status });
      return { ok: false, reason: 'unavailable' };
    }
    const balance = parseBalancePayload(await res.json());
    if (!balance) {
      console.warn('[money] balance payload malformed');
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true, balance };
  } catch (err) {
    console.warn('[money] balance fetch threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Refund one settled payment, full amount, seller-only (the Worker enforces
 * both). The app writes NOTHING on success — the payment webhook finalizes
 * the ledger row when charge.refunded lands; callers annotate locally and
 * let the next settled refresh reconcile.
 *
 * 'already_refunded' is a SUCCESS (the money is already on its way back),
 * never an error — the Worker replays idempotently on double-taps.
 */
export async function refundPayment(transactionId: string): Promise<RefundResult> {
  const token = await accessToken();
  if (!token) return { ok: false, reason: 'unauthenticated' };
  try {
    const res = await fetch(`${NETWORK_URL}/money/refund`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ transaction_id: transactionId }),
    });
    if (res.status === 401) return { ok: false, reason: 'session_expired' };
    if (res.status === 404 || res.status === 409) {
      return { ok: false, reason: 'not_refundable' };
    }
    if (!res.ok) {
      console.warn('[money] refund failed', { status: res.status });
      return { ok: false, reason: 'failed' };
    }
    const data = (await res.json()) as { outcome?: unknown };
    if (data.outcome === 'refunded' || data.outcome === 'already_refunded') {
      return { ok: true, outcome: data.outcome };
    }
    console.warn('[money] refund payload malformed');
    return { ok: false, reason: 'failed' };
  } catch (err) {
    console.warn('[money] refund threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: 'failed' };
  }
}

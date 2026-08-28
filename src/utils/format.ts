/**
 * Shared display formatters + the vendor-facing vocabulary for the decision
 * surfaces (Incoming tile, PlexChat decision slot).
 *
 * VOCABULARY BOUNDARY (Day 21 STOP-0, locked): user-visible strings use the
 * kind noun (Order / Booking / Reach / Message) and the plain status words
 * below. The schema's internal terms never appear in anything a user reads.
 */
import type { InboundKind } from '../types/inbound';
import type { EngagementStatus } from '../types/engagement';

/** Cents → "$12.50". Currency-aware via Intl (present under Hermes on SDK 55). */
export function formatCents(cents: number, currency: string = 'usd'): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch (err) {
    // Unknown currency code (or an engine without Intl): fall back to a plain
    // dollar rendering rather than crashing a decision surface.
    console.warn('[format] Intl currency format failed; using fallback', {
      currency,
      error: err instanceof Error ? err.message : String(err),
    });
    return `$${(cents / 100).toFixed(2)}`;
  }
}

/** The user-facing noun for each knock kind (never the schema term). */
export const KIND_LABEL: Record<InboundKind, string> = {
  reach: 'Reach',
  booking: 'Booking',
  order: 'Order',
  message: 'Message',
  // The network speaking for itself (0037a) — a stamp coming off, not a person
  // knocking. Senderless and thread-less, so it carries no accept path.
  notice: 'Notice',
};

/**
 * The accept control names WHAT is being accepted and FOR HOW MUCH — the
 * Day 21 STOP 4 contract ("Accept order — $12.50"). An unpriced booking/order
 * names the kind alone; a plain reach/message accept stays bare.
 */
export function formatAcceptLabel(
  kind: InboundKind,
  priceCents: number | null,
  currency: string = 'usd',
): string {
  if (kind !== 'booking' && kind !== 'order') return 'Accept';
  const noun = KIND_LABEL[kind].toLowerCase();
  if (priceCents === null) return `Accept ${noun}`;
  return `Accept ${noun} — ${formatCents(priceCents, currency)}`;
}

/**
 * Engagement rows show the COMMITMENT noun (Day 21 STOP-0): a promoted
 * scheduled reach is a "Plan", not a "Reach". ('message' cannot mint an
 * engagement; mapped for exhaustiveness only.)
 */
export const ENGAGEMENT_KIND_LABEL: Record<InboundKind, string> = {
  reach: 'Plan',
  booking: 'Booking',
  order: 'Order',
  message: 'Message',
  // Mapped for exhaustiveness only, exactly as 'message' above is: a notice
  // cannot mint an engagement, so this entry is unreachable. It is still a real
  // word rather than a placeholder — an unreachable string a user could
  // theoretically read must not look like debug output.
  notice: 'Notice',
};

/** Vendor-side status words (Day 21 STOP-0): never "fulfilled" in the app. */
export const STATUS_LABEL: Record<EngagementStatus, string> = {
  accepted: 'Accepted',
  paid: 'Paid',
  fulfilled: 'Done',
  cancelled: 'Cancelled',
};

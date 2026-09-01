import { useEffect, useRef } from 'react';
import useCards from './useCards';

// useCommerceReconcile — flips commerce_enabled on priced practice cards once
// payouts exist (ruling P-7, 2026-09-01).
//
// WHAT P-7 CREATED. A clinician now states their price at setup whether or not
// Stripe Connect is finished. The price is stored either way — set_card_commerce
// runs its Connect check INSIDE `if p_enabled then` while the UPDATE writes
// price_cents unconditionally (live version: migration 0033) — so such a card
// sits priced with commerce_enabled = false. Something has to notice when
// payouts arrive and make it chargeable. This is that something.
//
// WHY IT IS A CLIENT HOOK AND NOT A TRIGGER, which is a design decision and not
// a convenience: a trigger on entities.business_verified, or the Connect webhook
// writing cards directly, would be A SECOND WRITE PATH for commerce fields.
// Migration 0014 names set_card_commerce "the ONLY write path" and this repo's
// single-canonical-write-path rule forbids a second one. The webhook cannot call
// set_card_commerce either — it is current_entity_id()-scoped, so a service-role
// caller has a null actor and the function raises. A service-role variant would
// be a new writer AND a migration; that is a ruling, not a diff.
//
// THE TIMING CONSEQUENCE, RULED ACCEPTABLE IN P-7 AND RESTATED HERE SO NOBODY
// REDISCOVERS IT AS A BUG: the flip happens the next time the Money panel is
// open with payouts ready, NOT at the instant the Connect webhook lands. A visit
// booked in that window is not charged. In the ordinary path that window is
// nearly zero — the clinician is standing in Money when Connect returns — but it
// is not zero, and nothing here pretends otherwise.
//
// PRACTICE CARDS ONLY. CardEditorSheet gives an ordinary card a manual commerce
// toggle, so an owner can deliberately hold one priced-but-disabled; flipping it
// underneath them would override a choice they made. A practice card has no
// disable affordance, which is what makes the intent unambiguous there and only
// there.
//
// WHERE IT IS MOUNTED, AND WHY NOT App ROOT. It takes `paymentsReady` as an
// argument rather than calling useMoneyBalance itself, and MoneyPanel passes the
// balance it has already loaded. Mounting it in App.tsx Root — the
// usePushTokenRegistration shape — would have added a /money/balance request to
// every cold start for every user, signed-out ones included, to serve a case
// only clinicians reach. MoneyPanel is also the EARLIEST the app can know: it is
// where Connect onboarding is launched and where the balance is refreshed on
// return, so the flip lands in the same breath as payouts becoming ready.
// KNOWN GAP: Connect completed on another device flips nothing until Money is
// opened once here.
//
// Each card is attempted at most once per session, so a persistent server
// refusal cannot spin.

export default function useCommerceReconcile(paymentsReady: boolean): void {
  const { cards, setCardCommerce, refresh } = useCards();
  // Cards already attempted this session — the retry guard. A failure is logged
  // and NOT retried: if the server refuses, it will refuse identically on the
  // next render, and a loop would be a write storm rather than a fix.
  const attempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!paymentsReady) return;

    const pending = cards.filter(
      (c) =>
        c.kind === 'practice' &&
        c.commerce_enabled === false &&
        c.price_cents !== null &&
        !attempted.current.has(c.id),
    );
    if (pending.length === 0) return;

    let cancelled = false;
    void (async () => {
      let flipped = 0;
      for (const card of pending) {
        attempted.current.add(card.id);
        try {
          // PASS THE CARD'S OWN price_cents AND commerce_terms BACK.
          // set_card_commerce FORCE-WRITES both (`price_cents = p_price_cents`,
          // `commerce_terms = p_terms`) rather than coalescing, so sending null
          // here would ERASE the stored price — the exact thing P-7 exists to
          // preserve, destroyed by the code meant to honour it.
          await setCardCommerce(card.id, {
            enabled: true,
            priceCents: card.price_cents,
            terms: card.commerce_terms ?? null,
          });
          flipped += 1;
        } catch (err) {
          // Never silent: this is the only trace that a card the owner priced is
          // still not chargeable.
          console.warn('[commerce-reconcile] enable failed; card stays priced but off', {
            cardId: card.id,
            error: err,
          });
        }
      }
      if (!cancelled && flipped > 0) await refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [paymentsReady, cards, setCardCommerce, refresh]);
}

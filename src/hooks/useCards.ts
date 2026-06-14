import { useCardContext } from '../context/CardContext';

// Thin re-export of the CardContext reader. The card list, load logic, and the
// gated createCard mutator + onboarding latch live in <CardProvider>
// (src/context/CardContext.tsx) so the card the onboarding helper seeds is
// visible to Root without a remount — same shared-state pattern as
// useEntity / useVendor (see BUG-002).
export default function useCards() {
  return useCardContext();
}

import { useVendorContext } from '../context/VendorContext';

// Thin re-export of the VendorContext reader. The vendor row, load logic, and
// createVendor mutator live in <VendorProvider> (src/context/VendorContext.tsx)
// so writes from OnboardingScreen are visible to Root without a sign-out
// round trip.
export default function useVendor() {
  return useVendorContext();
}

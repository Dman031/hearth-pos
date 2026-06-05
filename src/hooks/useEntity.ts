import { useEntityContext } from '../context/EntityContext';

// Thin re-export of the EntityContext reader. The entity row, load logic, and
// createEntity/updateEntity mutators live in <EntityProvider>
// (src/context/EntityContext.tsx) so writes from EntitySetupScreen are visible
// to Root without a sign-out round trip — same shared-state pattern as
// useAuth / useVendor (see BUG-002).
export default function useEntity() {
  return useEntityContext();
}

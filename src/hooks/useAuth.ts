import { useAuthContext } from '../context/AuthContext';

// Thin re-export of the AuthContext reader. The state, subscription, and auth
// methods live in <AuthProvider> (src/context/AuthContext.tsx) so every call
// site sees the same user/session/isLoading values.
export default function useAuth() {
  return useAuthContext();
}

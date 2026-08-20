import { useNetInfo } from '@react-native-community/netinfo';

// A hint, not a gate — isConnected can be true on a tower with no usable
// throughput, the standard SAR field-connectivity failure mode. Nothing in
// this app should ever *block* a real request on this being true; it only
// drives presentation (map.tsx's "showing cached data" banner) and, in a
// later story, when to proactively retry a queued action. A user-initiated
// action always attempts the real request regardless and lets the
// existing request timeout classify the failure.
export function useIsOnline(): boolean {
  const { isConnected } = useNetInfo();
  // isConnected is `null` before the first native event arrives — treat
  // that startup window as online (the optimistic default every other
  // fetch in this app already assumes) rather than flashing an "offline"
  // banner for a moment on every cold start.
  return isConnected !== false;
}

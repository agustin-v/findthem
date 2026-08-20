import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useLocationPermission } from '@/hooks/useLocationPermission';
import { reportLocation } from '@/lib/api';

// Battery-conscious, not a naive fixed-interval poll (Story 40): Balanced
// (not High/Highest — walking-pace tracking doesn't need navigation-grade
// precision, and accuracy tier is the biggest battery lever here, per this
// story's own design brief), distanceInterval as the primary trigger
// (roughly matches the design brief's "~10s" target at normal walking
// pace, without polling a stationary volunteer).
const ACCURACY = Location.Accuracy.Balanced;
const DISTANCE_INTERVAL_M = 15;

// expo-location's own `timeInterval` option is NOT a keepalive — it's a
// minimum-interval throttle, and it's Android-only (iOS has no equivalent
// and ignores it entirely, leaving distanceInterval as the sole trigger).
// A real keepalive — so a stationary volunteer still pings occasionally
// and the coordinator can tell "idle" apart from "went dark" on BOTH
// platforms — needs an explicit timer re-sending the last known fix with
// a fresh timestamp.
const KEEPALIVE_INTERVAL_MS = 60_000;

// A vehicle-based volunteer (resource_type: motorbikes | cars) moving at
// speed can cross 15m every ~1s, far exceeding apps/api's 10/min
// per-volunteer rate limit on this endpoint. This client-side floor keeps
// normal operation comfortably inside that budget on both platforms
// without depending on the server-side 429 (which is silently swallowed
// below — better not to trigger it at all).
const MIN_PING_INTERVAL_MS = 8_000;

interface LastFix {
  lat: number;
  lng: number;
}

function sendPing(token: string, fix: LastFix) {
  reportLocation(token, {
    lat: fix.lat,
    lng: fix.lng,
    // The moment of sending, not the GPS fix's own timestamp — the two
    // are normally near-identical, and this is also what the keepalive
    // resend (a stale lastFixRef with a fresh "still here" moment) needs.
    // Note this does NOT protect against a genuinely wrong device clock
    // (apps/api rejects a recorded_at more than 5 minutes in the future)
    // — there's no client-side fix for that without a time-sync
    // mechanism this app doesn't have. The dev-mode log below is the
    // realistic mitigation: a systematically skewed clock shows up as
    // every single ping failing in the same way, at least discoverable
    // while testing instead of silent on both ends of the connection.
    recordedAt: new Date().toISOString(),
  }).catch((error) => {
    // Best-effort — a dropped ping (network blip, a 403 from stale
    // consent, a 429 from the rate limit, a 422 from clock skew) isn't
    // worth surfacing to the volunteer, and a 401 here isn't handled
    // specially either: the screen's own poll of GET /volunteer/search
    // independently hits the same 401 and already drives sign-out.
    if (__DEV__) console.warn('useLocationReporting: ping failed', error);
  });
}

// Foreground only — background reporting while the app is backgrounded or
// the screen is locked is Epic #8/Story 31's territory (offline-queueing +
// background tasks), deliberately out of scope here. watchPositionAsync's
// foreground service naturally stops delivering updates once the app
// suspends; no extra code enforces that boundary.
//
// Never starts if consentLocation isn't exactly true — checked from a
// server-authoritative source (GET /volunteer/search's consent_location,
// refreshed on every poll, Story 40), not assumed from the join form
// alone or read only once. Also never starts without OS location
// permission already granted; if consent is true but permission is still
// undetermined, this requests it once (a volunteer who explicitly
// consented at join has already agreed to be asked).
export function useLocationReporting(token: string | null, consentLocation: boolean) {
  const { status: permissionStatus, request: requestPermission } = useLocationPermission();
  const lastFixRef = useRef<LastFix | null>(null);
  const lastSentAtRef = useRef(0);

  // Re-attempts a failed/never-started watch when the app returns to the
  // foreground (e.g. the volunteer just enabled OS Location Services or
  // granted permission in Settings and switched back) — without this,
  // watchPositionAsync rejecting once (master location toggle off,
  // provider unavailable) left reporting silently dead for the rest of
  // the session with nothing to retry it.
  const [foregroundTick, setForegroundTick] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForegroundTick((t) => t + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (consentLocation !== true || !token) return;

    if (permissionStatus === 'undetermined') {
      requestPermission();
      return;
    }

    if (permissionStatus !== 'granted') return;

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    const maybeSend = (fix: LastFix) => {
      lastFixRef.current = fix;
      const now = Date.now();
      if (now - lastSentAtRef.current < MIN_PING_INTERVAL_MS) return;
      lastSentAtRef.current = now;
      sendPing(token, fix);
    };

    Location.watchPositionAsync(
      { accuracy: ACCURACY, distanceInterval: DISTANCE_INTERVAL_M },
      (position) => {
        maybeSend({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
    )
      .then((sub) => {
        if (cancelled) {
          sub.remove();
          return;
        }
        subscription = sub;
      })
      .catch((error) => {
        if (__DEV__) console.warn('useLocationReporting: watchPositionAsync failed', error);
      });

    const keepalive = setInterval(() => {
      if (lastFixRef.current) maybeSend(lastFixRef.current);
    }, KEEPALIVE_INTERVAL_MS);

    return () => {
      cancelled = true;
      subscription?.remove();
      clearInterval(keepalive);
    };
  }, [token, consentLocation, permissionStatus, requestPermission, foregroundTick]);
}

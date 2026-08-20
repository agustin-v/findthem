import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { Check, ChevronRight, MessageCircle, Plus } from 'lucide-react-native';
import type { Channel } from 'phoenix';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { RemarkForm } from '@/components/remark-form';
import { SubjectDetailsModal } from '@/components/subject-details-modal';
import { SubjectPhotoModal } from '@/components/subject-photo-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useLocationReporting } from '@/hooks/useLocationReporting';
import { useTheme } from '@/hooks/use-theme';
import {
  ApiError,
  getVolunteerMessages,
  getVolunteerSearch,
  isAuthError,
  updateSegmentStatus,
  type Message,
  type Remark,
  type VolunteerGeneration,
  type VolunteerSearchData,
  type VolunteerSearchInfo,
  type VolunteerSegment,
} from '@/lib/api';
import { getLastReadAt, hydrateChatReadState, resetChatReadState } from '@/lib/chat-read-state';
import {
  getCachedVolunteerSearch,
  resetOfflineStore,
  setCachedVolunteerSearch,
} from '@/lib/offline-cache';
import { getSocket, resetSocket } from '@/lib/socket';
import { getMapStyleUrl, hasApiKey } from '@/lib/tomtom';
import { clearVolunteerToken, getVolunteerToken } from '@/lib/token';
import { useIsOnline } from '@/hooks/useIsOnline';
import {
  SEGMENT_FILL_OPACITY,
  SEGMENT_LINE_OPACITY,
  segmentsToGeoJSON,
  type SegmentProperties,
  type SegmentStatus,
  type SegmentStatusInfo,
} from '@/lib/segments';

const POLL_INTERVAL_MS = 15000;
const DEFAULT_CENTER: [number, number] = [12.4964, 41.9028];
const EMPTY_SEGMENTS_FC: FeatureCollection<Polygon | MultiPolygon, SegmentProperties> = {
  type: 'FeatureCollection',
  features: [],
};
const MY_ASSIGNMENT_COLOR = '#DD5A34';
const LOCK_LINE_COLOR = '#1f2937';

const STATUS_LABELS: Record<SegmentStatus, string> = {
  not_assigned: 'Not started',
  assigned: 'Assigned',
  in_progress: 'Searching',
  searched: 'Searched',
};

// Headline shown above the sheet's action button — a friendlier framing
// of the same status than the compact pill label alone.
const STATUS_HEADLINES: Record<SegmentStatus, string> = {
  not_assigned: 'Ready to search',
  assigned: 'Ready to search',
  in_progress: 'Searching now',
  searched: 'Already searched',
};

// Same kind → color/symbol mapping as apps/ui's useRemarkMarkers.ts — one
// remark kind reads the same way on both the coordinator's and the
// volunteer's map. Map, not a plain object — `kind` comes from the
// backend and, pre-validation, could be a string like "constructor" that
// resolves to an inherited Object.prototype member on a plain object
// lookup instead of undefined, silently defeating the `??` fallback below.
const REMARK_KIND_COLOR = new Map<string, string>([
  ['sighting', '#3b82f6'],
  ['hazard', '#dc2626'],
  ['note', '#6b7280'],
]);
const REMARK_KIND_SYMBOL = new Map<string, string>([
  ['sighting', '\u{1F441}'], // eye
  ['hazard', '⚠'], // warning triangle
  ['note', '\u{1F4DD}'], // memo
]);

type ScreenState = 'loading' | 'ready' | 'retry' | 'expired';

// "MISSING 3h" / "MISSING 2d" next to the area in the context bar — a
// rough, human-scale sense of urgency from the search's last-known-position
// timestamp, not a precision duration.
function formatElapsed(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return 'just now';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return `${Math.floor(ms / 60000)}m`;
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function toSegmentModel(segment: VolunteerSegment): SegmentStatusInfo {
  return {
    segmentId: segment.segmentId,
    status: segment.status,
    searchedAt: segment.searchedAt ? new Date(segment.searchedAt).getTime() : undefined,
    locked: segment.locked,
    lockedForMe: segment.lockedForMe,
    lockReason: segment.lockReason,
  };
}

export default function MapScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [search, setSearch] = useState<VolunteerSearchInfo | null>(null);
  const [segments, setSegments] = useState<VolunteerSegment[]>([]);
  const [generation, setGeneration] = useState<VolunteerGeneration | null>(null);
  const [mySegmentIds, setMySegmentIds] = useState<number[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<VolunteerSegment | null>(null);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [selectedRemark, setSelectedRemark] = useState<Remark | null>(null);
  const [segmentActionError, setSegmentActionError] = useState<string | null>(null);
  const [updatingSegment, setUpdatingSegment] = useState(false);
  const [confirmMarkSearched, setConfirmMarkSearched] = useState(false);
  const [areaSearchedSuccess, setAreaSearchedSuccess] = useState(false);
  const [remarkFormOpen, setRemarkFormOpen] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [failedHeaderThumbnailUrl, setFailedHeaderThumbnailUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [consentLocation, setConsentLocation] = useState(false);
  // Non-null exactly while the screen is showing the on-disk cache instead
  // of a live GET /volunteer/search response — cleared the moment a live
  // fetch succeeds. Drives the "showing saved data" banner below; it's not
  // simply tied to useIsOnline() because a live fetch that's merely slow
  // (not truly offline) should show the same honest state while it's
  // in flight.
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const isOnline = useIsOnline();
  // Starts foreground reporting once both this volunteer's own consent
  // (server-authoritative, refreshed on every poll/refresh below, not
  // assumed from the join form or read only once) and a token are known.
  // Passing null instead of the real token once screenState leaves 'ready'
  // (removed, expired session, a failed reload) is deliberate, not
  // redundant with useLocationReporting's own !token check — token itself
  // stays a valid, unexpired string in that state (nothing clears it),
  // so without this the GPS watch would keep running and POSTing against
  // a search the volunteer no longer has access to until they manually
  // navigate away.
  useLocationReporting(screenState === 'ready' ? token : null, consentLocation);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Shared by the initial load, the cache-first read, the background poll,
  // and refreshSegments — one place setting the six pieces of state a
  // GET /volunteer/search response (live or cached) fans out to.
  const applySearchData = useCallback((data: VolunteerSearchData) => {
    setSearch(data.search);
    setSegments(data.segments);
    setGeneration(data.generation);
    setMySegmentIds(data.mySegmentIds);
    setRemarks(data.remarks);
    setConsentLocation(data.consentLocation);
  }, []);

  // The initial load's live fetch, the background poll, and
  // refreshSegments (triggered by the debounced socket handler below) can
  // all have a GET /volunteer/search in flight at once — on a slow/flaky
  // connection, nothing guarantees the initial load's own fetch resolves
  // first. Without this, a later-triggered-but-faster-resolving refresh
  // could get silently overwritten (both in React state AND the on-disk
  // cache) by the initial load's slower, now-stale response arriving
  // after it. Same "sequence number, not just an in-flight flag" pattern
  // loadMessagesSeqRef already uses in this file.
  const searchDataSeqRef = useRef(0);
  const [messages, setMessages] = useState<Message[]>([]);
  // Bumped on focus (e.g. returning from /chat, which has just called
  // markReadUpTo) so unreadCount below recomputes against the latest
  // getLastReadAt() even when `messages` itself hasn't changed.
  const [focusTick, setFocusTick] = useState(0);

  // Called from the mount effect, the 15s poll, the socket debounce, and
  // useFocusEffect below — up to four independent triggers that can have
  // requests in flight at once. A sequence number, not just an in-flight
  // flag, so an older response that resolves after a newer one can't win
  // and revert the list to stale data.
  const loadMessagesSeqRef = useRef(0);
  const loadMessages = useCallback(async (authToken: string) => {
    const seq = ++loadMessagesSeqRef.current;
    try {
      const data = await getVolunteerMessages(authToken);
      if (seq !== loadMessagesSeqRef.current) return;
      setMessages(data);
    } catch {
      // Best-effort — the unread badge just misses this cycle; not worth
      // surfacing an error for a secondary indicator when the primary
      // search/segments load above already handles auth expiry.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setScreenState('loading');
      // Awaited before the unread badge can matter — otherwise a cold
      // start briefly reports the whole thread as unread while the
      // persisted read marker is still loading from disk.
      const [storedToken] = await Promise.all([getVolunteerToken(), hydrateChatReadState()]);
      if (!storedToken) {
        router.replace('/');
        return;
      }
      if (!cancelled) setToken(storedToken);

      // Cache-first: render whatever's on disk immediately, before ever
      // touching the network — an offline app-open would otherwise show
      // nothing but a spinner (then the retry screen), with no map, no
      // segment list, and nothing to enqueue anything from. A live fetch
      // is still always attempted right after and, on success, silently
      // replaces this with fresh data.
      const cached = await getCachedVolunteerSearch(storedToken);
      if (cancelled) return;
      if (cached) {
        applySearchData(cached.data);
        setCachedAt(cached.cachedAt);
        setScreenState('ready');
      }

      const seq = ++searchDataSeqRef.current;
      try {
        const data = await getVolunteerSearch(storedToken);
        if (cancelled) return;
        if (seq !== searchDataSeqRef.current) return;
        applySearchData(data);
        setCachedAt(null);
        setScreenState('ready');
        loadMessages(storedToken);
        setCachedVolunteerSearch(storedToken, data);
      } catch (error) {
        if (cancelled) return;
        if (isAuthError(error)) {
          // A real auth error fires regardless of the seq check below — it
          // doesn't matter whether some other, newer request already won
          // the race, the token itself is genuinely invalid either way.
          await clearVolunteerToken();
          resetSocket();
          resetChatReadState();
          await resetOfflineStore();
          setScreenState('expired');
        } else if (seq === searchDataSeqRef.current && !cached) {
          // Both conditions matter: no cache to fall back on (a dead end
          // for the volunteer), AND this is still the most recent request
          // (not a slow, since-superseded one) — without the seq check, a
          // slow initial fetch failing *after* a faster refreshSegments()
          // (triggered by the socket handler below) already succeeded
          // would wrongly drop an already-showing live screen back to the
          // retry screen.
          setScreenState('retry');
        }
        // Else: a live fetch failure with a cache already rendered, or
        // already superseded by a newer successful fetch, just means
        // staying on whatever's already showing — not an error state, and
        // not a screen that blocks the volunteer from using what they've
        // got.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, reloadKey, loadMessages, applySearchData]);

  // Background refresh so a volunteer sees other volunteers' progress
  // without manually reloading. Silent on transient failures — this is a
  // nice-to-have refresh, not the primary load — but a 401 means they were
  // removed from the search mid-session and must be signed out. Guarded
  // against overlap the same way pending.tsx's poll loop is — a slow
  // response must not race the next interval tick.
  useEffect(() => {
    if (screenState !== 'ready' || !token) return undefined;

    let inFlight = false;

    const interval = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      const seq = ++searchDataSeqRef.current;
      try {
        const data = await getVolunteerSearch(token);
        if (seq !== searchDataSeqRef.current) return;
        applySearchData(data);
        setCachedAt(null);
        await loadMessages(token);
        setCachedVolunteerSearch(token, data);
      } catch (error) {
        if (isAuthError(error)) {
          await clearVolunteerToken();
          resetSocket();
          resetChatReadState();
          await resetOfflineStore();
          setScreenState('expired');
        }
        // Any other failure (offline, timeout, 5xx) is silent here by
        // design — this is a background nice-to-have refresh, not the
        // primary load, and whatever's currently on screen (live or
        // cached) just stays put until the next successful tick.
      } finally {
        inFlight = false;
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [screenState, token, loadMessages, applySearchData]);

  // A lighter-weight alternative to `reload` for callers that only need
  // fresh data (e.g. after posting a remark) — unlike `reload`, this
  // doesn't reset screenState to 'loading' and blank the map with a
  // full-screen spinner over what the volunteer was just looking at.
  // Also refreshes `search` (photoUrls are presigned, 1hr-expiring URLs —
  // the periodic poll below re-fetches them well within that window, but
  // this manual trigger needs to as well or it'd be the one path that
  // still goes stale over a long session).
  // Returns the freshly-fetched segments (or undefined on failure) so a
  // caller that also has an open bottom sheet (see the 409-locked branch of
  // handleSetSegmentStatus below) can sync selectedSegment too — this
  // function only ever updates the top-level segments array/map layer
  // itself, which the sheet does NOT read from.
  const refreshSegments = useCallback(async () => {
    if (!token) return undefined;
    const seq = ++searchDataSeqRef.current;
    try {
      const data = await getVolunteerSearch(token);
      if (seq === searchDataSeqRef.current) {
        applySearchData(data);
        setCachedAt(null);
        setCachedVolunteerSearch(token, data);
      }
      // Still returned even if superseded — the caller (e.g. the 409-locked
      // branch of handleSetSegmentStatus) uses this to sync selectedSegment
      // specifically, a narrower concern than the shared search/segments
      // state above.
      return data.segments;
    } catch (error) {
      if (isAuthError(error)) {
        await clearVolunteerToken();
        resetSocket();
        resetChatReadState();
        await resetOfflineStore();
        setScreenState('expired');
      }
      return undefined;
    }
  }, [token, applySearchData]);

  // Same FindThemApiWeb.SearchChannel apps/ui subscribes to — joining
  // requires an already-approved volunteer (UserSocket re-checks status on
  // connect, same gate VolunteerAuth applies to every HTTP request), so
  // this only ever runs once the volunteer is already on this screen.
  // Every event just triggers the same refetch the 15s poll above already
  // does — this is a "wake up sooner" layer on top of that poll, not a
  // replacement for it, so a missed event is harmless. remark_created
  // shares segment_updated's debounce (refreshSegments also fetches
  // remarks now, Story 37) rather than message_created's faster one — a
  // map pin isn't as latency-sensitive as a live conversation.
  //
  // Debounced (trailing 2s): refreshSegments is a full GET /volunteer/search
  // — the entire generation's GeoJSON plus freshly-signed photo URLs, not a
  // small delta — and with N volunteers connected, one volunteer marking one
  // segment fans out to N of these full fetches. A short quiet window
  // collapses a burst of marks (a volunteer tapping through several
  // segments, or several volunteers finishing around the same time) into
  // one fetch instead of one per event.
  const debouncedRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedMessagesRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (screenState !== 'ready' || !token || !search?.id) return undefined;

    let channel: Channel | null = null;
    let cancelled = false;

    const debouncedRefresh = () => {
      if (debouncedRefreshRef.current) clearTimeout(debouncedRefreshRef.current);
      debouncedRefreshRef.current = setTimeout(refreshSegments, 2000);
    };
    // A shorter window than segment updates above — a coordinator message
    // is small (one row, not a full generation refetch) and immediacy
    // matters more for a live conversation than for segment-status churn.
    const debouncedMessagesRefresh = () => {
      if (debouncedMessagesRefreshRef.current) clearTimeout(debouncedMessagesRefreshRef.current);
      debouncedMessagesRefreshRef.current = setTimeout(() => loadMessages(token), 400);
    };

    getSocket()
      .then((socket) => {
        if (cancelled) return;

        channel = socket.channel(`search:${search.id}`, {});
        channel.on('segment_updated', debouncedRefresh);
        channel.on('generation_created', debouncedRefresh);
        channel.on('segment_assignment_created', debouncedRefresh);
        channel.on('remark_created', debouncedRefresh);
        channel.on('message_created', debouncedMessagesRefresh);
        channel
          .join()
          .receive('error', (reason) => {
            // Not fatal — every event above just wakes up the existing
            // 15s poll sooner, so a failed join means "stay on that
            // cadence", not "this screen is broken".
            console.warn(`search:${search.id} channel join failed`, reason);
          });
      })
      .catch((error) => {
        console.warn('Realtime socket unavailable, continuing on REST polling', error);
      });

    return () => {
      cancelled = true;
      channel?.leave();
      if (debouncedRefreshRef.current) clearTimeout(debouncedRefreshRef.current);
      if (debouncedMessagesRefreshRef.current) clearTimeout(debouncedMessagesRefreshRef.current);
    };
  }, [screenState, token, search?.id, refreshSegments, loadMessages]);

  // Returning from /chat (which just called markReadUpTo) must clear the
  // badge even though `messages` itself hasn't changed — bump focusTick so
  // unreadCount below recomputes against the now-current getLastReadAt().
  useFocusEffect(
    useCallback(() => {
      setFocusTick((t) => t + 1);
      if (token) loadMessages(token);
    }, [token, loadMessages]),
  );

  const unreadMessageCount = useMemo(() => {
    const readUpTo = getLastReadAt();
    return messages.filter((m) => m.sender === 'coordinator' && m.insertedAt > (readUpTo ?? '')).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, focusTick]);

  const geojson = useMemo(
    () =>
      segmentsToGeoJSON(
        generation?.segments ?? EMPTY_SEGMENTS_FC,
        segments.map(toSegmentModel),
        mySegmentIds,
      ),
    [generation, segments, mySegmentIds],
  );

  // Only remarks with a real position render — some volunteer-authored
  // ones won't have one (GPS denied/failed).
  const remarksWithPosition = useMemo(
    () => remarks.filter((r): r is Remark & { lat: number; lng: number } => r.lat != null && r.lng != null),
    [remarks],
  );

  const handleSegmentPress = useCallback(
    (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      // A GeoJSONSource press bubbles up to the Map's own onPress unless
      // stopped — without this, selecting a segment would immediately
      // deselect it again via the background-tap handler below.
      event.stopPropagation();

      const feature = event.nativeEvent.features[0];
      const properties = feature?.properties as
        | { segmentId?: number; searchable?: boolean }
        | undefined;
      if (properties?.segmentId == null || properties.searchable === false) return;

      const segment = segments.find((s) => s.segmentId === properties.segmentId);
      if (segment) {
        setSegmentActionError(null);
        setSelectedSegment(segment);
      } else {
        // A segment from a generation the volunteer hasn't refreshed into
        // view yet (no status row fetched) — treat as fresh/not_assigned
        // rather than silently doing nothing on tap.
        setSegmentActionError(null);
        setSelectedSegment({
          segmentId: properties.segmentId,
          status: 'not_assigned',
          searchedAt: null,
          locked: false,
          lockedForMe: false,
          lockReason: null,
        });
      }
    },
    [segments],
  );

  const handleSetSegmentStatus = async (status: SegmentStatus) => {
    if (!selectedSegment || !token) return;
    setUpdatingSegment(true);
    setSegmentActionError(null);

    try {
      const updated = await updateSegmentStatus(token, selectedSegment.segmentId, status);
      setSegments((prev) => {
        const exists = prev.some((s) => s.segmentId === updated.segmentId);
        return exists
          ? prev.map((s) => (s.segmentId === updated.segmentId ? updated : s))
          : [...prev, updated];
      });
      setSelectedSegment(updated);

      // "Mark as searched" is the one status change that closes the sheet
      // and confirms first (see confirmMarkSearched below) — completing it
      // gets a full-screen acknowledgment instead of just updating a pill
      // in place, since it's the volunteer's signal that this area is done.
      if (status === 'searched') {
        setConfirmMarkSearched(false);
        setAreaSearchedSuccess(true);
      }
    } catch (error) {
      // A locked segment (409, reserved for a different volunteer) gets its
      // own message — relevant both for this direct tap and, later, for a
      // queued offline action (#54) that fails to sync because the segment
      // got locked in the meantime. Refresh so the sheet's own locked state
      // catches up and the disabled buttons reflect reality immediately,
      // instead of the volunteer retrying the same blocked action.
      if (error instanceof ApiError && error.status === 409 && error.errors?.segment) {
        setSegmentActionError('This segment is locked for another volunteer right now.');
        // refreshSegments() alone only updates the top-level segments array
        // (and the map's own layer) — the still-open sheet reads from
        // selectedSegment, a separate piece of state, so without explicitly
        // syncing it here the locked notice/disabled buttons would never
        // actually catch up and the volunteer could just keep retrying the
        // same blocked action.
        refreshSegments().then((freshSegments) => {
          const fresh = freshSegments?.find((s) => s.segmentId === selectedSegment.segmentId);
          if (fresh) setSelectedSegment(fresh);
        });
      } else {
        setSegmentActionError('Could not update this segment. Please try again.');
      }
      setConfirmMarkSearched(false);
    } finally {
      setUpdatingSegment(false);
    }
  };

  if (screenState === 'loading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (screenState === 'expired') {
    return (
      <ThemedView style={styles.centered}>
        <SafeAreaView style={styles.centeredContent}>
          <ThemedText type="subtitle" style={styles.centerText}>
            Your session expired
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            Please join again with your code.
          </ThemedText>
          <PrimaryButton label="Try a different code" onPress={() => router.replace('/')} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (screenState === 'retry' || !search) {
    return (
      <ThemedView style={styles.centered}>
        <SafeAreaView style={styles.centeredContent}>
          <ThemedText type="subtitle" style={styles.centerText}>
            Couldn&apos;t load the search
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            Check your connection and try again.
          </ThemedText>
          <PrimaryButton label="Retry" onPress={reload} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  const center: [number, number] =
    search.lkpLng != null && search.lkpLat != null
      ? [search.lkpLng, search.lkpLat]
      : DEFAULT_CENTER;

  return (
    <ThemedView style={styles.container}>
      {hasApiKey() ? (
        <MapLibreMap
          mapStyle={getMapStyleUrl()}
          style={styles.map}
          onPress={() => setSelectedSegment(null)}>
          <Camera initialViewState={{ center, zoom: 15 }} />
          <GeoJSONSource id="segments" data={geojson} onPress={handleSegmentPress}>
            <Layer
              id="segments-fill"
              type="fill"
              source="segments"
              paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': SEGMENT_FILL_OPACITY }}
            />
            <Layer
              id="segments-line"
              type="line"
              source="segments"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 2,
                'line-opacity': SEGMENT_LINE_OPACITY,
              }}
            />
            {/* Coordinator-assigned segments get a highlight outline — a
                "start here" hint, not a restriction, since every approved
                volunteer can still see and mark every segment. */}
            <Layer
              id="segments-my-assignment"
              type="line"
              source="segments"
              filter={['==', ['get', 'assignedToMe'], true]}
              paint={{
                'line-color': MY_ASSIGNMENT_COLOR,
                'line-width': 4,
                'line-opacity': 0.9,
              }}
            />
            {/* A locked segment needs to be discoverable at a glance, not
                only by tapping it — a map-level dashed outline, same idiom
                apps/ui uses (dark, dashed, distinct from every status
                color), matching the whole point of Story #52/#56: avoid
                duplicate work by making a lock visible before someone
                starts walking a segment reserved for someone else. */}
            <Layer
              id="segments-lock-line"
              type="line"
              source="segments"
              filter={['==', ['get', 'locked'], true]}
              paint={{
                'line-color': LOCK_LINE_COLOR,
                'line-width': 3,
                'line-dasharray': [2, 2],
              }}
            />
          </GeoJSONSource>
          {remarksWithPosition.map((remark) => (
            <Marker
              key={remark.id}
              id={remark.id}
              lngLat={[remark.lng, remark.lat]}
              onPress={() => setSelectedRemark(remark)}>
              <View
                style={[
                  styles.remarkMarker,
                  { backgroundColor: REMARK_KIND_COLOR.get(remark.kind) ?? theme.textSecondary },
                ]}>
                <Text style={styles.remarkMarkerSymbol}>
                  {REMARK_KIND_SYMBOL.get(remark.kind) ?? '\u{1F4CD}'}
                </Text>
              </View>
            </Marker>
          ))}
        </MapLibreMap>
      ) : (
        <ThemedView style={[styles.map, styles.centered]}>
          <ThemedText themeColor="textSecondary">Map unavailable</ThemedText>
        </ThemedView>
      )}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <ThemedView style={styles.header} type="backgroundElement">
          {search.photoUrls.length > 0 && search.photoUrls[0] !== failedHeaderThumbnailUrl && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View photo"
              onPress={() => setPhotoModalOpen(true)}>
              <Image
                source={{ uri: search.photoUrls[0] }}
                style={styles.headerThumbnail}
                contentFit="cover"
                onError={() => setFailedHeaderThumbnailUrl(search.photoUrls[0])}
              />
            </Pressable>
          )}
          <View style={styles.headerInfo}>
            <ThemedText type="smallBold">{search.subjectName}</ThemedText>
            <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
              {[formatElapsed(search.lkpAt) && `Missing ${formatElapsed(search.lkpAt)}`, search.lkpAddress]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => setDetailsOpen(true)}
            style={styles.detailsLink}>
            <ThemedText type="small" style={{ color: theme.primary }}>
              Details
            </ThemedText>
            <ChevronRight color={theme.primary} size={16} />
          </Pressable>
        </ThemedView>

        {cachedAt != null && (
          <ThemedView style={styles.cacheBanner} type="backgroundElement">
            <ThemedText type="small" themeColor="textSecondary">
              {isOnline
                ? `Showing saved data from ${formatElapsed(new Date(cachedAt).toISOString())} ago — updating…`
                : `You're offline. Showing saved data from ${formatElapsed(new Date(cachedAt).toISOString())} ago.`}
            </ThemedText>
          </ThemedView>
        )}

        {messages.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              unreadMessageCount > 0 ? `Chat, ${unreadMessageCount} unread` : 'Chat with coordinator'
            }
            onPress={() =>
              router.push({
                pathname: '/chat',
                params: { searchId: search.id, contactPhone: search.contactPhone },
              })
            }
            style={[styles.fab, styles.chatFab, { backgroundColor: theme.backgroundElement }]}>
            <MessageCircle color={theme.text} size={24} />
            {unreadMessageCount > 0 && (
              <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
                <ThemedText type="small" style={styles.unreadBadgeText}>
                  {unreadMessageCount}
                </ThemedText>
              </View>
            )}
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report something"
          onPress={() => setRemarkFormOpen(true)}
          style={[styles.fab, { backgroundColor: theme.primary }]}>
          <Plus color={theme.primaryText} size={26} />
        </Pressable>
      </SafeAreaView>

      <Modal
        visible={!!selectedSegment}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedSegment(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedSegment(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <ThemedView style={styles.sheet}>
              <SafeAreaView style={styles.sheetContent}>
                {selectedSegment && (
                  <>
                    <View style={styles.sheetHandle} />
                    <View style={styles.sheetTopRow}>
                      <ThemedText type="code" themeColor="textSecondary">
                        Segment
                      </ThemedText>
                      <View
                        style={[
                          styles.statusPill,
                          {
                            backgroundColor:
                              selectedSegment.status === 'searched'
                                ? theme.successSoft
                                : selectedSegment.status === 'in_progress'
                                  ? theme.primarySoft
                                  : theme.backgroundSelected,
                          },
                        ]}>
                        <ThemedText
                          type="small"
                          style={{
                            color:
                              selectedSegment.status === 'searched'
                                ? theme.success
                                : selectedSegment.status === 'in_progress'
                                  ? theme.primary
                                  : theme.textSecondary,
                          }}>
                          {STATUS_LABELS[selectedSegment.status]}
                        </ThemedText>
                      </View>
                    </View>
                    <ThemedText type="subtitle">{STATUS_HEADLINES[selectedSegment.status]}</ThemedText>

                    {selectedSegment.locked && (
                      <View style={styles.lockedNotice}>
                        <ThemedText type="small" style={styles.lockedNoticeText}>
                          {selectedSegment.lockedForMe
                            ? 'Locked — reserved for you'
                            : selectedSegment.lockReason
                              ? `Locked: ${selectedSegment.lockReason}`
                              : 'Locked by your coordinator'}
                        </ThemedText>
                      </View>
                    )}

                    {segmentActionError && (
                      <ThemedText type="small" style={styles.error}>
                        {segmentActionError}
                      </ThemedText>
                    )}

                    <PrimaryButton
                      label="Start searching"
                      variant="secondary"
                      onPress={() => handleSetSegmentStatus('in_progress')}
                      disabled={
                        selectedSegment.status === 'in_progress' ||
                        updatingSegment ||
                        (selectedSegment.locked && !selectedSegment.lockedForMe)
                      }
                      loading={updatingSegment}
                    />
                    <PrimaryButton
                      label="Mark as searched"
                      onPress={() => setConfirmMarkSearched(true)}
                      disabled={
                        selectedSegment.status === 'searched' ||
                        updatingSegment ||
                        (selectedSegment.locked && !selectedSegment.lockedForMe)
                      }
                      loading={updatingSegment}
                    />
                    <PrimaryButton
                      label="Close"
                      variant="secondary"
                      onPress={() => setSelectedSegment(null)}
                    />
                  </>
                )}
              </SafeAreaView>
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!selectedRemark}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedRemark(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSelectedRemark(null)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <ThemedView style={styles.sheet}>
              <SafeAreaView style={styles.sheetContent}>
                {selectedRemark && (
                  <>
                    <View style={styles.sheetHandle} />
                    <View style={styles.sheetTopRow}>
                      <ThemedText type="code" themeColor="textSecondary">
                        {new Date(selectedRemark.reportedAt).toLocaleString()}
                      </ThemedText>
                      <View
                        style={[
                          styles.statusPill,
                          { backgroundColor: theme.backgroundSelected },
                        ]}>
                        <ThemedText
                          type="small"
                          style={{ color: REMARK_KIND_COLOR.get(selectedRemark.kind) ?? theme.text }}>
                          {selectedRemark.kind}
                        </ThemedText>
                      </View>
                    </View>
                    {selectedRemark.text ? (
                      <ThemedText type="subtitle">{selectedRemark.text}</ThemedText>
                    ) : (
                      <ThemedText themeColor="textSecondary">No details added.</ThemedText>
                    )}
                    <PrimaryButton
                      label="Close"
                      variant="secondary"
                      onPress={() => setSelectedRemark(null)}
                    />
                  </>
                )}
              </SafeAreaView>
            </ThemedView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={confirmMarkSearched}
        animationType="fade"
        transparent
        onRequestClose={() => setConfirmMarkSearched(false)}>
        <View style={styles.confirmBackdrop}>
          <ThemedView type="backgroundElement" style={styles.confirmCard}>
            <View style={[styles.confirmIconBadge, { backgroundColor: theme.primarySoft }]}>
              <Check color={theme.primary} size={28} />
            </View>
            <ThemedText type="subtitle" style={styles.centerText}>
              Mark area as searched?
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              This tells the coordinator you&apos;ve fully covered your area. They&apos;ll review and sign it
              off.
            </ThemedText>
            <PrimaryButton
              label="Yes, mark as searched"
              onPress={() => handleSetSegmentStatus('searched')}
              loading={updatingSegment}
            />
            <PrimaryButton
              label="Keep searching"
              variant="secondary"
              onPress={() => setConfirmMarkSearched(false)}
              disabled={updatingSegment}
            />
          </ThemedView>
        </View>
      </Modal>

      <Modal
        visible={areaSearchedSuccess}
        animationType="slide"
        onRequestClose={() => setAreaSearchedSuccess(false)}>
        <ThemedView style={styles.centered}>
          <SafeAreaView style={styles.successContent}>
            <View style={[styles.confirmIconBadge, { backgroundColor: theme.successSoft }]}>
              <Check color={theme.success} size={32} />
            </View>
            <ThemedText type="subtitle" style={styles.centerText}>
              Area searched
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              Thank you. The coordinator can see your area is covered.
            </ThemedText>

            <ThemedView type="backgroundSelected" style={styles.spottedRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Spotted something here?
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setAreaSearchedSuccess(false);
                  setSelectedSegment(null);
                  setRemarkFormOpen(true);
                }}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  Add a report
                </ThemedText>
              </Pressable>
            </ThemedView>

            <PrimaryButton
              label="Back to search"
              onPress={() => {
                setAreaSearchedSuccess(false);
                setSelectedSegment(null);
              }}
            />
          </SafeAreaView>
        </ThemedView>
      </Modal>

      {token && (
        <RemarkForm
          visible={remarkFormOpen}
          token={token}
          onClose={() => setRemarkFormOpen(false)}
          onSubmitted={refreshSegments}
        />
      )}

      <SubjectPhotoModal
        visible={photoModalOpen}
        subjectName={search.subjectName}
        photoUrls={search.photoUrls}
        onClose={() => setPhotoModalOpen(false)}
      />

      <SubjectDetailsModal
        visible={detailsOpen}
        search={search}
        onClose={() => setDetailsOpen(false)}
        onOpenPhotos={() => {
          setDetailsOpen(false);
          setPhotoModalOpen(true);
        }}
        onOpenChat={() => {
          setDetailsOpen(false);
          router.push({
            pathname: '/chat',
            params: { searchId: search.id, contactPhone: search.contactPhone },
          });
        }}
        unreadMessageCount={unreadMessageCount}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredContent: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  centerText: {
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.three,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerThumbnail: {
    width: 40,
    height: 40,
    borderRadius: Radius.chip,
  },
  cacheBanner: {
    marginTop: Spacing.two,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    alignSelf: 'flex-start',
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  detailsLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  remarkMarker: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  remarkMarkerSymbol: {
    fontSize: 14,
    lineHeight: 16,
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.four,
    right: Spacing.three,
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatFab: {
    bottom: Spacing.four + 56 + Spacing.two,
    width: 48,
    height: 48,
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 14,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
  },
  sheetContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.35)',
    marginBottom: Spacing.two,
  },
  sheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusPill: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
  },
  confirmBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: Radius.card,
    padding: Spacing.five,
    gap: Spacing.two,
  },
  confirmIconBadge: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  successContent: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
  },
  spottedRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.input,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
    marginBottom: Spacing.one,
  },
  error: {
    color: '#B3432B',
  },
  lockedNotice: {
    borderRadius: Radius.chip,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: 'rgba(31,41,55,0.1)',
  },
  lockedNoticeText: {
    color: '#1f2937',
  },
});

import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { RemarkForm } from '@/components/remark-form';
import { SubjectPhotoModal } from '@/components/subject-photo-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  getVolunteerSearch,
  isAuthError,
  updateSegmentStatus,
  type VolunteerGeneration,
  type VolunteerSearchInfo,
  type VolunteerSegment,
} from '@/lib/api';
import { getMapStyleUrl, hasApiKey } from '@/lib/tomtom';
import { clearVolunteerToken, getVolunteerToken } from '@/lib/token';
import {
  SEGMENT_COLORS,
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
const MY_ASSIGNMENT_COLOR = '#fbbf24';

const STATUS_LABELS: Record<SegmentStatus, string> = {
  not_assigned: 'Not started',
  assigned: 'Assigned',
  in_progress: 'In progress',
  searched: 'Searched',
};

// The legend shows one swatch per status — "searched" segments actually
// decay through several colors over time (see segments.ts's
// getSegmentColor), but a single representative shade is enough for a
// compact legend.
const LEGEND_COLORS: Record<SegmentStatus, string> = {
  not_assigned: SEGMENT_COLORS.not_assigned,
  assigned: SEGMENT_COLORS.assigned,
  in_progress: SEGMENT_COLORS.in_progress,
  searched: SEGMENT_COLORS.fresh,
};

type ScreenState = 'loading' | 'ready' | 'retry' | 'expired';

function toSegmentModel(segment: VolunteerSegment): SegmentStatusInfo {
  return {
    segmentId: segment.segmentId,
    status: segment.status,
    searchedAt: segment.searchedAt ? new Date(segment.searchedAt).getTime() : undefined,
  };
}

export default function MapScreen() {
  const router = useRouter();
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [search, setSearch] = useState<VolunteerSearchInfo | null>(null);
  const [segments, setSegments] = useState<VolunteerSegment[]>([]);
  const [generation, setGeneration] = useState<VolunteerGeneration | null>(null);
  const [mySegmentIds, setMySegmentIds] = useState<number[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<VolunteerSegment | null>(null);
  const [segmentActionError, setSegmentActionError] = useState<string | null>(null);
  const [updatingSegment, setUpdatingSegment] = useState(false);
  const [remarkFormOpen, setRemarkFormOpen] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [failedHeaderThumbnailUrl, setFailedHeaderThumbnailUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setScreenState('loading');
      const storedToken = await getVolunteerToken();
      if (!storedToken) {
        router.replace('/');
        return;
      }
      if (!cancelled) setToken(storedToken);

      try {
        const data = await getVolunteerSearch(storedToken);
        if (cancelled) return;
        setSearch(data.search);
        setSegments(data.segments);
        setGeneration(data.generation);
        setMySegmentIds(data.mySegmentIds);
        setScreenState('ready');
      } catch (error) {
        if (cancelled) return;
        if (isAuthError(error)) {
          await clearVolunteerToken();
          setScreenState('expired');
        } else {
          setScreenState('retry');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, reloadKey]);

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
      try {
        const data = await getVolunteerSearch(token);
        setSearch(data.search);
        setSegments(data.segments);
        setGeneration(data.generation);
        setMySegmentIds(data.mySegmentIds);
      } catch (error) {
        if (isAuthError(error)) {
          await clearVolunteerToken();
          setScreenState('expired');
        }
      } finally {
        inFlight = false;
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [screenState, token]);

  // A lighter-weight alternative to `reload` for callers that only need
  // fresh data (e.g. after posting a remark) — unlike `reload`, this
  // doesn't reset screenState to 'loading' and blank the map with a
  // full-screen spinner over what the volunteer was just looking at.
  // Also refreshes `search` (photoUrls are presigned, 1hr-expiring URLs —
  // the periodic poll below re-fetches them well within that window, but
  // this manual trigger needs to as well or it'd be the one path that
  // still goes stale over a long session).
  const refreshSegments = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getVolunteerSearch(token);
      setSearch(data.search);
      setSegments(data.segments);
      setGeneration(data.generation);
      setMySegmentIds(data.mySegmentIds);
    } catch (error) {
      if (isAuthError(error)) {
        await clearVolunteerToken();
        setScreenState('expired');
      }
    }
  }, [token]);

  const geojson = useMemo(
    () =>
      segmentsToGeoJSON(
        generation?.segments ?? EMPTY_SEGMENTS_FC,
        segments.map(toSegmentModel),
        mySegmentIds,
      ),
    [generation, segments, mySegmentIds],
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
        setSelectedSegment({ segmentId: properties.segmentId, status: 'not_assigned', searchedAt: null });
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
    } catch {
      setSegmentActionError('Could not update this segment. Please try again.');
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
          </GeoJSONSource>
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
          <ThemedText type="smallBold">{search.subjectName}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.legend} type="backgroundElement">
          {(Object.keys(STATUS_LABELS) as SegmentStatus[]).map((status) => (
            <View key={status} style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: LEGEND_COLORS[status] }]} />
              <ThemedText type="small">{STATUS_LABELS[status]}</ThemedText>
            </View>
          ))}
          {mySegmentIds.length > 0 && (
            <View style={styles.legendRow}>
              <View
                style={[
                  styles.legendSwatch,
                  { backgroundColor: 'transparent', borderWidth: 2, borderColor: MY_ASSIGNMENT_COLOR },
                ]}
              />
              <ThemedText type="small">Assigned to you</ThemedText>
            </View>
          )}
        </ThemedView>

        <Pressable
          accessibilityRole="button"
          onPress={() => setRemarkFormOpen(true)}
          style={styles.fab}>
          <ThemedText type="smallBold" style={styles.fabLabel}>
            + Report
          </ThemedText>
        </Pressable>
      </SafeAreaView>

      <Modal
        visible={!!selectedSegment}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedSegment(null)}>
        <View style={styles.backdrop}>
          <ThemedView style={styles.sheet}>
            <SafeAreaView style={styles.sheetContent}>
              {selectedSegment && (
                <>
                  <ThemedText type="subtitle">
                    {STATUS_LABELS[selectedSegment.status]}
                  </ThemedText>
                  {segmentActionError && (
                    <ThemedText type="small" style={styles.error}>
                      {segmentActionError}
                    </ThemedText>
                  )}
                  <PrimaryButton
                    label="Start searching"
                    variant="secondary"
                    onPress={() => handleSetSegmentStatus('in_progress')}
                    disabled={selectedSegment.status === 'in_progress' || updatingSegment}
                    loading={updatingSegment}
                  />
                  <PrimaryButton
                    label="Mark as searched"
                    onPress={() => handleSetSegmentStatus('searched')}
                    disabled={selectedSegment.status === 'searched' || updatingSegment}
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
        </View>
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
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerThumbnail: {
    width: 28,
    height: 28,
    borderRadius: Spacing.one,
  },
  legend: {
    alignSelf: 'flex-start',
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  fab: {
    position: 'absolute',
    bottom: Spacing.four,
    right: Spacing.three,
    backgroundColor: '#208AEF',
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  fabLabel: {
    color: '#ffffff',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
  },
  sheetContent: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  error: {
    color: '#e5484d',
  },
});

import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  type PressEventWithFeatures,
} from '@maplibre/maplibre-react-native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/primary-button';
import { RemarkForm } from '@/components/remark-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  getVolunteerSearch,
  isAuthError,
  updateZoneStatus,
  type VolunteerSearchInfo,
  type VolunteerZone,
} from '@/lib/api';
import { getMapStyleUrl, hasApiKey } from '@/lib/tomtom';
import { clearVolunteerToken, getVolunteerToken } from '@/lib/token';
import {
  ZONE_COLORS,
  ZONE_FILL_OPACITY,
  ZONE_LINE_OPACITY,
  zonesToGeoJSON,
  type Zone,
  type ZoneStatus,
} from '@/lib/zones';

const POLL_INTERVAL_MS = 15000;
const DEFAULT_CENTER: [number, number] = [12.4964, 41.9028];

const STATUS_LABELS: Record<ZoneStatus, string> = {
  not_assigned: 'Not started',
  assigned: 'Assigned',
  in_progress: 'In progress',
  searched: 'Searched',
};

// The legend shows one swatch per status — "searched" zones actually decay
// through several colors over time (see zones.ts's getZoneColor), but a
// single representative shade is enough for a compact legend.
const LEGEND_COLORS: Record<ZoneStatus, string> = {
  not_assigned: ZONE_COLORS.not_assigned,
  assigned: ZONE_COLORS.assigned,
  in_progress: ZONE_COLORS.in_progress,
  searched: ZONE_COLORS.fresh,
};

type ScreenState = 'loading' | 'ready' | 'retry' | 'expired';

function toZoneModel(zone: VolunteerZone): Zone {
  return {
    h3Index: zone.h3Index,
    status: zone.status,
    searchedAt: zone.searchedAt ? new Date(zone.searchedAt).getTime() : undefined,
  };
}

export default function MapScreen() {
  const router = useRouter();
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [search, setSearch] = useState<VolunteerSearchInfo | null>(null);
  const [zones, setZones] = useState<VolunteerZone[]>([]);
  const [selectedZone, setSelectedZone] = useState<VolunteerZone | null>(null);
  const [zoneActionError, setZoneActionError] = useState<string | null>(null);
  const [updatingZone, setUpdatingZone] = useState(false);
  const [remarkFormOpen, setRemarkFormOpen] = useState(false);
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
        setZones(data.zones);
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
        setZones(data.zones);
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
  // fresh zone data (e.g. after posting a remark) — unlike `reload`, this
  // doesn't reset screenState to 'loading' and blank the map with a
  // full-screen spinner over what the volunteer was just looking at.
  const refreshZones = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getVolunteerSearch(token);
      setZones(data.zones);
    } catch (error) {
      if (isAuthError(error)) {
        await clearVolunteerToken();
        setScreenState('expired');
      }
    }
  }, [token]);

  const geojson = useMemo(() => zonesToGeoJSON(zones.map(toZoneModel)), [zones]);

  const handleZonePress = useCallback(
    (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      // A GeoJSONSource press bubbles up to the Map's own onPress unless
      // stopped — without this, selecting a zone would immediately
      // deselect it again via the background-tap handler below.
      event.stopPropagation();

      const feature = event.nativeEvent.features[0];
      const h3Index = feature?.properties?.h3Index as string | undefined;
      if (!h3Index) return;
      const zone = zones.find((z) => z.h3Index === h3Index);
      if (zone) {
        setZoneActionError(null);
        setSelectedZone(zone);
      }
    },
    [zones],
  );

  const handleSetZoneStatus = async (status: ZoneStatus) => {
    if (!selectedZone || !token) return;
    setUpdatingZone(true);
    setZoneActionError(null);

    try {
      const updated = await updateZoneStatus(token, selectedZone.h3Index, status);
      setZones((prev) => prev.map((z) => (z.h3Index === updated.h3Index ? updated : z)));
      setSelectedZone(updated);
    } catch {
      setZoneActionError('Could not update this zone. Please try again.');
    } finally {
      setUpdatingZone(false);
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
        <MapLibreMap mapStyle={getMapStyleUrl()} style={styles.map} onPress={() => setSelectedZone(null)}>
          <Camera initialViewState={{ center, zoom: 15 }} />
          <GeoJSONSource id="zones" data={geojson} onPress={handleZonePress}>
            <Layer
              id="zones-fill"
              type="fill"
              source="zones"
              paint={{ 'fill-color': ['get', 'color'], 'fill-opacity': ZONE_FILL_OPACITY }}
            />
            <Layer
              id="zones-line"
              type="line"
              source="zones"
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 2,
                'line-opacity': ZONE_LINE_OPACITY,
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
          <ThemedText type="smallBold">{search.subjectName}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.legend} type="backgroundElement">
          {(Object.keys(STATUS_LABELS) as ZoneStatus[]).map((status) => (
            <View key={status} style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: LEGEND_COLORS[status] }]} />
              <ThemedText type="small">{STATUS_LABELS[status]}</ThemedText>
            </View>
          ))}
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
        visible={!!selectedZone}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedZone(null)}>
        <View style={styles.backdrop}>
          <ThemedView style={styles.sheet}>
            <SafeAreaView style={styles.sheetContent}>
              {selectedZone && (
                <>
                  <ThemedText type="subtitle">
                    {STATUS_LABELS[selectedZone.status]}
                  </ThemedText>
                  {zoneActionError && (
                    <ThemedText type="small" style={styles.error}>
                      {zoneActionError}
                    </ThemedText>
                  )}
                  <PrimaryButton
                    label="Start searching"
                    variant="secondary"
                    onPress={() => handleSetZoneStatus('in_progress')}
                    disabled={selectedZone.status === 'in_progress' || updatingZone}
                    loading={updatingZone}
                  />
                  <PrimaryButton
                    label="Mark as searched"
                    onPress={() => handleSetZoneStatus('searched')}
                    disabled={selectedZone.status === 'searched' || updatingZone}
                    loading={updatingZone}
                  />
                  <PrimaryButton
                    label="Close"
                    variant="secondary"
                    onPress={() => setSelectedZone(null)}
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
          onSubmitted={refreshZones}
        />
      )}
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
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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

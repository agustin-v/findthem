import { OfflineManager, type OfflinePack, type OfflinePackStatus } from '@maplibre/maplibre-react-native';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';

import {
  boundsFromGeoJSON,
  DEFAULT_MAX_ZOOM,
  DEFAULT_MIN_ZOOM,
  estimateTileCount,
  MAX_DOWNLOADABLE_TILES,
} from '@/lib/offline-tiles-policy';

// Native-heavy, untested wrapper around @maplibre/maplibre-react-native's
// OfflineManager (already-installed, no new dependency) — offline-tiles-
// policy.ts is where the actual bounds/tile-count math lives, tested
// under vitest. Same split as every other policy/adapter pair in this app.

// OfflinePack has no name field of its own (only a natively-generated
// id) — packs are found again by their user-supplied metadata instead, a
// searchId tag set at creation time.
function isPackForSearch(pack: OfflinePack, searchId: string): boolean {
  return pack.metadata?.searchId === searchId;
}

export async function findTilePackForSearch(searchId: string): Promise<OfflinePack | null> {
  try {
    const packs = await OfflineManager.getPacks();
    return packs.find((pack) => isPackForSearch(pack, searchId)) ?? null;
  } catch {
    return null;
  }
}

export interface DownloadEstimate {
  bounds: [number, number, number, number];
  tileCount: number;
  tooLarge: boolean;
}

export function estimateDownload(
  geojson: FeatureCollection<Polygon | MultiPolygon>,
): DownloadEstimate | null {
  const bounds = boundsFromGeoJSON(geojson);
  if (!bounds) return null;

  const tileCount = estimateTileCount(bounds, DEFAULT_MIN_ZOOM, DEFAULT_MAX_ZOOM);
  return { bounds, tileCount, tooLarge: tileCount > MAX_DOWNLOADABLE_TILES };
}

// A conscious, manual, one-search-at-a-time action (this story's own
// framing: "conscious storage/data cost, not automatic") — deletes any
// existing pack for this search first, so re-downloading (e.g. after a
// regenerate changed the segment geometry) doesn't just add a second,
// stale pack alongside the new one.
export async function downloadTilesForSearch(
  searchId: string,
  geojson: FeatureCollection<Polygon | MultiPolygon>,
  styleUrl: string,
  onProgress: (status: OfflinePackStatus) => void,
): Promise<OfflinePack> {
  const estimate = estimateDownload(geojson);
  if (!estimate) throw new Error('No segment geometry to derive download bounds from.');
  if (estimate.tooLarge) {
    throw new Error(
      `This area is too large to download offline (${estimate.tileCount.toLocaleString()} tiles, limit ${MAX_DOWNLOADABLE_TILES.toLocaleString()}).`,
    );
  }

  await deleteTilePacksForSearch(searchId);

  // Set deliberately, not left at whatever OfflineManager's own internal
  // default is (its doc comment doesn't even state one reliably) — this
  // is the hard backstop behind the tileCount estimate above; the estimate
  // and this limit should agree, but if they ever drift, the native limit
  // is what actually stops an oversized download from consuming unbounded
  // device storage. Synchronous/fire-and-forget (OfflineManager exposes no
  // promise for this call) — relies on React Native's bridge preserving
  // per-module call ordering ahead of createPack's own native call below,
  // which the estimate.tooLarge check above already gates against in the
  // common case.
  OfflineManager.setTileCountLimit(MAX_DOWNLOADABLE_TILES);

  // createPack's own promise resolves once the pack is *registered* and
  // the download has started, not once it's finished — confirmed against
  // the library's own source (OfflineManager.createPack awaits only
  // NativeOfflineModule.createPack + addListener, it never waits on a
  // progress event). Actual completion only ever arrives later via the
  // progress listener's status.state reaching "complete", so this wraps
  // that in a promise of its own rather than resolving early — resolving
  // on createPack's own promise would flip the UI to "Downloaded" while
  // tiles are still mid-fetch, silently defeating the feature.
  return new Promise<OfflinePack>((resolve, reject) => {
    OfflineManager.createPack(
      {
        mapStyle: styleUrl,
        bounds: estimate.bounds,
        minZoom: DEFAULT_MIN_ZOOM,
        maxZoom: DEFAULT_MAX_ZOOM,
        metadata: { searchId },
      },
      (pack, status) => {
        onProgress(status);
        // The library auto-calls removeListener(id) internally once state
        // reaches "complete" (see its own handleProgress) — nothing extra
        // needed here for the success path's listener cleanup.
        if (status.state === 'complete') resolve(pack);
      },
      (pack, error) => {
        // Unlike the "complete" progress case, the library does NOT
        // auto-remove listeners on error — done explicitly here so a
        // failed download doesn't leak a permanently-subscribed listener
        // for a pack that's about to be torn down below. The pack itself
        // is also deleted rather than left registered-but-broken — without
        // this, a failed download only gets cleaned up on the *next*
        // download attempt for this search (deleteTilePacksForSearch's own
        // call above), leaving an orphaned partial pack indefinitely if the
        // volunteer never retries.
        OfflineManager.removeListener(pack.id);
        OfflineManager.deletePack(pack.id).catch(() => {});
        if (__DEV__) console.warn('Offline tile download error', error);
        reject(new Error(error.message || 'Offline tile download failed.'));
      },
    ).catch((error) => {
      reject(error instanceof Error ? error : new Error('Failed to start offline tile download.'));
    });
  });
}

export async function deleteTilePacksForSearch(searchId: string): Promise<void> {
  try {
    const packs = await OfflineManager.getPacks();
    await Promise.all(
      packs
        .filter((pack) => isPackForSearch(pack, searchId))
        .map((pack) => {
          // Only a completed pack's listener is auto-removed by the
          // library itself (see downloadTilesForSearch's own comment) — an
          // in-progress or never-attached one still has a live listener
          // entry that deletePack alone won't clear.
          OfflineManager.removeListener(pack.id);
          return OfflineManager.deletePack(pack.id);
        }),
    );
  } catch (error) {
    // Best-effort, same reasoning as offline-cache.ts's own reset —
    // nothing here should block whatever the caller is actually trying
    // to do (a fresh download, or an identity-boundary reset). Logged in
    // dev so a real on-device failure isn't completely invisible, matching
    // resetOfflineDb's own precedent (a silently swallowed cleanup failure
    // left stale data behind with no record it happened, once already).
    if (__DEV__) console.warn('deleteTilePacksForSearch failed', error);
  }
}

// Called from resetOfflineStore() (every identity-boundary site) — this
// app only ever has one volunteer/search active at a time, so on a reset
// every downloaded pack belongs to an identity that's no longer current,
// the same "wipe everything, not just what we can positively attribute"
// approach offline-db.ts's own reset takes with the SQLite file.
export async function deleteAllTilePacks(): Promise<void> {
  try {
    const packs = await OfflineManager.getPacks();
    await Promise.all(
      packs.map((pack) => {
        OfflineManager.removeListener(pack.id);
        return OfflineManager.deletePack(pack.id);
      }),
    );
  } catch (error) {
    // Best-effort — see deleteTilePacksForSearch's own reasoning.
    if (__DEV__) console.warn('deleteAllTilePacks failed', error);
  }
}

export type { OfflinePack, OfflinePackStatus } from '@maplibre/maplibre-react-native';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { OfflinePackStatus } from '@maplibre/maplibre-react-native';

import {
  deleteTilePacksForSearch,
  downloadTilesForSearch,
  estimateDownload,
  findTilePackForSearch,
} from '@/lib/offline-tiles';
import { getMapStyleUrl } from '@/lib/tomtom';

export type TilePackState = 'checking' | 'not_downloaded' | 'downloading' | 'downloaded' | 'error';

export interface OfflineTilesController {
  state: TilePackState;
  hasGeometry: boolean;
  estimateTileCount: number | null;
  tooLarge: boolean;
  progress: OfflinePackStatus | null;
  errorMessage: string | null;
  download: () => Promise<void>;
  remove: () => Promise<void>;
}

// Owns the tile-pack lifecycle for one search, so a download can keep
// running (and its progress keep updating) whether or not
// SubjectDetailsModal — where the UI for this lives — happens to be open
// at the time, same reasoning outboxActions state already lives in map.tsx
// rather than inside whatever panel currently displays it.
export function useOfflineTiles(
  searchId: string | null,
  geojson: FeatureCollection<Polygon | MultiPolygon> | null,
): OfflineTilesController {
  const [state, setState] = useState<TilePackState>('checking');
  const [progress, setProgress] = useState<OfflinePackStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const checkSeqRef = useRef(0);
  // A plain ref, not state — needs to be read/set synchronously inside
  // download() itself to reject a re-entrant call before React has even
  // re-rendered with state === 'downloading'. Two near-simultaneous taps
  // both running before the first state update lands would otherwise both
  // pass a `state === 'downloading'` check and race two native
  // createPack calls (see offline-tiles.ts's own delete-then-create
  // ordering — the "loser" of that race ends up orphaned).
  const downloadingRef = useRef(false);

  // estimateDownload walks every coordinate of every segment polygon plus
  // a per-zoom-level tile count loop — map.tsx re-renders often enough
  // (poll interval, socket pushes, chat/remark state) that redoing this on
  // every render is wasted, non-trivial work for a search with large/many
  // segments.
  const estimate = useMemo(() => (geojson ? estimateDownload(geojson) : null), [geojson]);

  useEffect(() => {
    // No searchId yet (still loading) — leave state at its 'checking'
    // initializer. This app only ever has one active search per volunteer
    // session (same assumption offline-tiles.ts's own deleteAllTilePacks
    // reset makes), so there's no real "switch to a different search"
    // case to additionally reset for here.
    if (!searchId) return;

    const seq = ++checkSeqRef.current;
    findTilePackForSearch(searchId)
      .then((pack) => {
        if (checkSeqRef.current !== seq) return;
        setState(pack ? 'downloaded' : 'not_downloaded');
      })
      .catch(() => {
        if (checkSeqRef.current !== seq) return;
        setState('not_downloaded');
      });
  }, [searchId]);

  const download = useCallback(async () => {
    if (!searchId || !geojson || downloadingRef.current) return;
    downloadingRef.current = true;
    const seq = ++checkSeqRef.current;
    setState('downloading');
    setErrorMessage(null);
    setProgress(null);
    try {
      await downloadTilesForSearch(searchId, geojson, getMapStyleUrl(), (status) => {
        if (checkSeqRef.current !== seq) return;
        setProgress(status);
      });
      if (checkSeqRef.current !== seq) return;
      setState('downloaded');
    } catch (error) {
      if (__DEV__) console.warn('downloadTilesForSearch failed', error);
      if (checkSeqRef.current !== seq) return;
      setState('error');
      // A generic, volunteer-facing message rather than the raw thrown
      // error — a native NSError/Android exception's own message text can
      // echo low-level details (e.g. a failing request URL) that have no
      // business showing up on this screen. The one case worth
      // distinguishing (the tile budget) already throws its own clear,
      // intentional message from downloadTilesForSearch, so that one
      // passes through as-is.
      const message = error instanceof Error ? error.message : '';
      setErrorMessage(message.startsWith('This area is too large') ? message : 'Download failed. Try again.');
    } finally {
      downloadingRef.current = false;
    }
  }, [searchId, geojson]);

  const remove = useCallback(async () => {
    if (!searchId) return;
    const seq = ++checkSeqRef.current;
    await deleteTilePacksForSearch(searchId);
    if (checkSeqRef.current !== seq) return;
    setState('not_downloaded');
    setProgress(null);
  }, [searchId]);

  return {
    state,
    hasGeometry: geojson != null,
    estimateTileCount: estimate?.tileCount ?? null,
    tooLarge: estimate?.tooLarge ?? false,
    progress,
    errorMessage,
    download,
    remove,
  };
}

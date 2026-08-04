import { useCallback, useEffect, useState } from 'react';

import {
  getLocationPermissionState,
  requestLocationPermission,
  type LocationPermissionState,
} from '@/lib/location';

export function useLocationPermission() {
  const [status, setStatus] = useState<LocationPermissionState | 'checking'>('checking');

  useEffect(() => {
    let cancelled = false;
    getLocationPermissionState().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(async () => {
    const result = await requestLocationPermission();
    setStatus(result);
    return result;
  }, []);

  return { status, request };
}

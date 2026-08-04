import * as Location from 'expo-location';

export type LocationPermissionState = 'granted' | 'denied' | 'undetermined';

export async function getLocationPermissionState(): Promise<LocationPermissionState> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status;
}

export async function requestLocationPermission(): Promise<LocationPermissionState> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status;
}

export interface Coords {
  lat: number;
  lng: number;
}

// expo-location's getCurrentPositionAsync has no built-in timeout option —
// in realistic field conditions (dense cover, indoors) a GPS fix can take a
// very long time or never arrive at all. This is best-effort location for
// an optional report field, not a critical path, so give up rather than
// hang the caller indefinitely.
const LOCATION_TIMEOUT_MS = 8000;

export async function getCurrentCoords(): Promise<Coords | null> {
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timed out waiting for a GPS fix')), LOCATION_TIMEOUT_MS);
      }),
    ]);
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}

const API_KEY = process.env.EXPO_PUBLIC_TOMTOM_API_KEY;

export function hasApiKey(): boolean {
  return !!API_KEY;
}

// Mirrors apps/ui/src/lib/tomtom.ts's getMapStyleUrl — same base style so
// the map looks the same on both the coordinator and volunteer apps.
export function getMapStyleUrl(): string {
  return `https://api.tomtom.com/map/1/style/25.2.3-0/2/basic_street-light.json?key=${API_KEY}`;
}

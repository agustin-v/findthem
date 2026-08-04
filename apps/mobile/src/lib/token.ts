import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store has no native backing on web (its web module exports
// nothing), so it must be routed to localStorage there instead — but
// localStorage is XSS-readable, unlike the Keychain/Keystore SecureStore
// uses natively, so this fallback is dev-testing convenience only and must
// never run in a real production web build. Native builds are unaffected —
// `__DEV__` is compiled out of them entirely and this branch never runs.
function assertWebDevOnly() {
  if (!__DEV__) {
    throw new Error(
      'Web is not a supported target for storing volunteer tokens outside development.',
    );
  }
}

const TOKEN_KEY = 'findthem_volunteer_token';

export async function saveVolunteerToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    assertWebDevOnly();
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getVolunteerToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    assertWebDevOnly();
    return localStorage.getItem(TOKEN_KEY);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearVolunteerToken(): Promise<void> {
  if (Platform.OS === 'web') {
    assertWebDevOnly();
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Split out from chat-read-state.ts specifically so that module stays
// importable from vitest — react-native (needed here for Platform) uses
// Flow syntax vitest can't parse, the same reason lib/token.ts has no
// test file. chat-read-state.ts's own tests mock this module entirely,
// so its real (react-native-importing) body never loads under vitest.
const STORAGE_KEY = 'findthem_chat_last_read_at';

// Not a secret, but reuses SecureStore (already a dependency for the
// volunteer token) rather than adding a new storage package for one key.
// SecureStore has no web backing at all, so — same shape as token.ts —
// web falls back to localStorage, dev/testing convenience only.
export async function readLastReadAt(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  }
  return SecureStore.getItemAsync(STORAGE_KEY);
}

export async function writeLastReadAt(value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
    return;
  }
  if (value) await SecureStore.setItemAsync(STORAGE_KEY, value);
  else await SecureStore.deleteItemAsync(STORAGE_KEY);
}

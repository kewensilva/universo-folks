import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Refresh token no Keychain (iOS) / Keystore (Android). ADR 0012.
 * No navegador (só para desenvolvimento com `expo start --web`) não há SecureStore:
 * usa sessionStorage, que some ao fechar a aba.
 */
const KEY = 'folks.refresh';
const web = Platform.OS === 'web';

export const refreshStore = {
  get: async () => (web ? globalThis.sessionStorage?.getItem(KEY) ?? null : SecureStore.getItemAsync(KEY)),
  set: async (v: string) => (web ? globalThis.sessionStorage?.setItem(KEY, v) : SecureStore.setItemAsync(KEY, v)),
  clear: async () => (web ? globalThis.sessionStorage?.removeItem(KEY) : SecureStore.deleteItemAsync(KEY)),
};

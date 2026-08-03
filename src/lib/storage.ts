import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Plattform-bewusste Key-Value-Persistenz:
// - Web: Cookie mit SameSite=Strict (+ Secure bei HTTPS)
// - Nativ (iOS/Android): expo-secure-store (verschlüsselter Keychain/Keystore)
// Einzige Implementierung für Supabase-Session, Theme und aktiven Spieler.

const escapeKey = (key: string) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const ONE_YEAR_SECONDS = 31536000;

export const appStorage = {
  getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return Promise.resolve(null);
      const match = document.cookie.match(new RegExp('(?:^|; )' + escapeKey(key) + '=([^;]*)'));
      return Promise.resolve(match ? decodeURIComponent(match[1]) : null);
    }
    return SecureStore.getItemAsync(key);
  },

  setItem(key: string, value: string, maxAgeSeconds: number = ONE_YEAR_SECONDS): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return Promise.resolve();
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const secure = isHttps ? '; Secure' : '';
      document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Strict${secure}`;
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },

  removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return Promise.resolve();
      document.cookie = `${key}=; path=/; max-age=0; SameSite=Strict`;
      return Promise.resolve();
    }
    return SecureStore.deleteItemAsync(key);
  },
};

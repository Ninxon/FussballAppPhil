import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase-Konfiguration fehlt. Prüfe ob die .env Datei ' +
    'EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_ANON_KEY enthält.'
  );
}

// Wird vor dem Login gesetzt — steuert Cookie-Laufzeit (8h vs. 30 Tage)
let rememberMeActive = false;
export const setRememberMe = (val: boolean) => { rememberMeActive = val; };

const cookieStorage = {
  getItem: (key: string): Promise<string | null> => {
    if (typeof document === 'undefined') return Promise.resolve(null);
    const match = document.cookie.match(
      new RegExp('(?:^|; )' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
    );
    return Promise.resolve(match ? decodeURIComponent(match[1]) : null);
  },
  setItem: (key: string, value: string): Promise<void> => {
    if (typeof document === 'undefined') return Promise.resolve();
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const secure = isHttps ? '; Secure' : '';
    const maxAge = rememberMeActive ? 2592000 : 28800; // 30 Tage vs. 8 Stunden
    document.cookie = `${key}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict${secure}`;
    return Promise.resolve();
  },
  removeItem: (key: string): Promise<void> => {
    if (typeof document === 'undefined') return Promise.resolve();
    document.cookie = `${key}=; path=/; max-age=0; SameSite=Strict`;
    return Promise.resolve();
  },
};

// Auf Native (iOS/Android): expo-secure-store → verschlüsselter Keychain/Keystore
// Auf Web: Cookie mit SameSite=Strict + Secure (bei HTTPS)
const storage = Platform.OS === 'web' ? cookieStorage : {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

// Recovery-Link zuverlässig erkennen: Bei einem Passwort-Reset hängt Supabase
// `type=recovery` an die URL. `detectSessionInUrl` parst den Hash aber ASYNCHRON
// beim Laden und entfernt ihn danach sofort — hängt der React-Listener erst
// später, geht das PASSWORD_RECOVERY-Event verloren und der Nutzer wird einfach
// eingeloggt. Deshalb lesen wir den Marker hier SYNCHRON beim Modul-Load aus
// (läuft garantiert vor dem async URL-Parsing), bevor der Hash geleert wird.
const RECOVERY_RE = /(^|[#&?])type=recovery(&|$)/;
export const isPasswordRecoveryUrl =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? RECOVERY_RE.test(window.location.hash) || RECOVERY_RE.test(window.location.search)
    : false;

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

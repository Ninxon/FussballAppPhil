import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { appStorage } from './storage';

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

// Gemeinsamer Adapter (src/lib/storage.ts); die Cookie-Laufzeit der Session
// hängt an "Angemeldet bleiben": 30 Tage vs. 8 Stunden.
const storage = {
  getItem: (key: string) => appStorage.getItem(key),
  setItem: (key: string, value: string) =>
    appStorage.setItem(key, value, rememberMeActive ? 2592000 : 28800),
  removeItem: (key: string) => appStorage.removeItem(key),
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

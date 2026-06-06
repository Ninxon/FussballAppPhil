import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Player } from '../types';
import { PlayerService } from '../services/playerService';

const STORAGE_KEY = 'pk_active_player';

// Plattform-bewusste Persistenz des aktiven Kindes (analog ThemeContext):
// Cookie im Web, SecureStore nativ.
const activePlayerStorage = {
  get: async (): Promise<string | null> => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return null;
      const match = document.cookie.match(new RegExp('(?:^|; )' + STORAGE_KEY + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    }
    const SecureStore = await import('expo-secure-store');
    return SecureStore.getItemAsync(STORAGE_KEY);
  },
  set: async (value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return;
      const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const secure = isHttps ? '; Secure' : '';
      document.cookie = `${STORAGE_KEY}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Strict${secure}`;
    } else {
      const SecureStore = await import('expo-secure-store');
      SecureStore.setItemAsync(STORAGE_KEY, value);
    }
  },
};

// Laedt die Spieler (Kinder) des eingeloggten Elternteils und verwaltet das
// aktive Kind. Bei genau einem Spieler blendet die UI den Umschalter aus.
export function usePlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const persistedRef = useRef<string | null>(null);

  useEffect(() => {
    activePlayerStorage.get().then(v => { persistedRef.current = v; });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const { data } = await PlayerService.fetchMine();
      if (!isMounted) return;
      const list = ((data ?? []) as Player[]).filter(p => p.is_active);
      setPlayers(list);
      setActivePlayerId(prev => {
        if (prev && list.some(p => p.id === prev)) return prev;
        if (persistedRef.current && list.some(p => p.id === persistedRef.current)) return persistedRef.current;
        return list[0]?.id ?? null;
      });
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (session?.user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        load();
      } else if (!session?.user) {
        setPlayers([]);
        setActivePlayerId(null);
        setLoading(false);
      }
    });

    const channel = supabase
      .channel(`players-live-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => {
        if (isMounted) load();
      })
      .subscribe();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  const setActivePlayer = useCallback((id: string) => {
    setActivePlayerId(id);
    persistedRef.current = id;
    activePlayerStorage.set(id);
  }, []);

  const activePlayer = players.find(p => p.id === activePlayerId) ?? null;

  return { players, activePlayer, activePlayerId, setActivePlayer, loading };
}

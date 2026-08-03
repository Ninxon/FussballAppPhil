import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Player } from '../types';
import { PlayerService } from '../services/playerService';
import { appStorage } from '../lib/storage';

// Persistenz des aktiven Kindes: Cookie im Web, SecureStore nativ (lib/storage).
const STORAGE_KEY = 'pk_active_player';

// Laedt die Spieler (Kinder) des eingeloggten Elternteils und verwaltet das
// aktive Kind. Bei genau einem Spieler blendet die UI den Umschalter aus.
export function usePlayers() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const persistedRef = useRef<string | null>(null);

  useEffect(() => {
    appStorage.getItem(STORAGE_KEY).then(v => { persistedRef.current = v; });
  }, []);

  useEffect(() => {
    let isMounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

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

    // Realtime nur auf die EIGENEN Kinder hoeren (parent_id=eq.uid). Ohne Filter
    // wuerde jede players-Aenderung irgendeines Kunden bei JEDEM eingeloggten
    // Elternteil ein komplettes Neuladen ausloesen.
    const setupChannel = (uid: string) => {
      if (channel) return;
      channel = supabase
        .channel(`players-live-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `parent_id=eq.${uid}` },
          () => { if (isMounted) load(); },
        )
        .subscribe();
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (session?.user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        load();
        setupChannel(session.user.id);
      } else if (!session?.user) {
        setPlayers([]);
        setActivePlayerId(null);
        setLoading(false);
        if (channel) { supabase.removeChannel(channel); channel = null; }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const setActivePlayer = useCallback((id: string) => {
    setActivePlayerId(id);
    persistedRef.current = id;
    appStorage.setItem(STORAGE_KEY, id);
  }, []);

  const activePlayer = players.find(p => p.id === activePlayerId) ?? null;

  return { players, activePlayer, activePlayerId, setActivePlayer, loading };
}

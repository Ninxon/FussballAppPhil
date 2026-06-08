import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BlockedPeriod } from '../utils/bookingRules';

// Lädt die gesperrten Zeiträume (Schulferien etc.) aus blocked_periods.
// Öffentlich lesbar; klein (wenige Zeilen) -> einmaliger Fetch beim Mount.
export function useBlockedPeriods(): BlockedPeriod[] {
  const [periods, setPeriods] = useState<BlockedPeriod[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('blocked_periods')
        .select('start_date, end_date');
      if (mounted && data) setPeriods(data as BlockedPeriod[]);
    })();
    return () => { mounted = false; };
  }, []);

  return periods;
}

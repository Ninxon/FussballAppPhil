import { useMemo } from 'react';
import type { AdminAppointment } from '../../hooks/useAdminData';

export type AppointmentIndex = {
  confirmedByDateTime: Map<string, AdminAppointment[]>;
  confirmedCountByDate: Map<string, number>;
  shortCancelsByDate: Map<string, AdminAppointment[]>;
  shortCancelsByDateTime: Map<string, AdminAppointment[]>;
};

/**
 * Indexiert die Termine einmal pro Datenänderung statt bei jedem Render
 * ~100 Array-Scans zu fahren (7 Slots × 7 Tage im Wochenraster plus
 * Tages-Header). Schlüssel sind `date` bzw. `date|time`.
 */
export function useAppointmentIndex(allAppointments: AdminAppointment[]): AppointmentIndex {
  return useMemo(() => {
    const confirmedByDateTime = new Map<string, AdminAppointment[]>();
    const confirmedCountByDate = new Map<string, number>();
    const shortCancelsByDate = new Map<string, AdminAppointment[]>();
    const shortCancelsByDateTime = new Map<string, AdminAppointment[]>();
    const push = (map: Map<string, AdminAppointment[]>, key: string, a: AdminAppointment) => {
      const arr = map.get(key);
      if (arr) arr.push(a); else map.set(key, [a]);
    };
    for (const a of allAppointments) {
      if (a.status === 'confirmed') {
        push(confirmedByDateTime, `${a.date}|${a.time}`, a);
        confirmedCountByDate.set(a.date, (confirmedCountByDate.get(a.date) ?? 0) + 1);
      } else if (a.status === 'cancelled' && a.short_notice_cancel) {
        push(shortCancelsByDate, a.date, a);
        push(shortCancelsByDateTime, `${a.date}|${a.time}`, a);
      }
    }
    return { confirmedByDateTime, confirmedCountByDate, shortCancelsByDate, shortCancelsByDateTime };
  }, [allAppointments]);
}

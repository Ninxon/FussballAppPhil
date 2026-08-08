import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { PROGRAMS } from '../constants/programs';
import { Appointment } from '../types';

export async function exportToCalendar(appt: Appointment) {
  const program = PROGRAMS.find(p => p.id === appt.program);
  const duration = program?.duration ?? 20;
  const summary = program?.name ?? 'Training';

  const [h, m] = appt.time.split(':').map(Number);
  const endTotal = h * 60 + m + duration;
  const endH = Math.floor(endTotal / 60);
  const endM = endTotal % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  const dateStr = appt.date.replace(/-/g, '');
  const startStr = `${pad(h)}${pad(m)}00`;
  const endStr = `${pad(endH)}${pad(endM)}00`;
  const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PK Fussballschule//App//DE',
    'BEGIN:VEVENT',
    `UID:${appt.id}@pk-fussballschule`,
    `DTSTAMP:${now}`,
    `DTSTART:${dateStr}T${startStr}`,
    `DTEND:${dateStr}T${endStr}`,
    `SUMMARY:${summary} – PK Fussballschule`,
    'DESCRIPTION:PK Fussballschule Training – Rhein-Main',
    'LOCATION:PK Fussballschule – Rhein-Main',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  if (Platform.OS === 'web') {
    // @ts-ignore
    const blob = new Blob([ics], { type: 'text/calendar' });
    // @ts-ignore
    const url = URL.createObjectURL(blob);
    // @ts-ignore
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pk-termin.ics';
    a.click();
    // @ts-ignore
    URL.revokeObjectURL(url);
  } else {
    // Neue expo-file-system-API (ab SDK 54): create/write sind synchron, die
    // alten *Async-Funktionen liegen nur noch unter 'expo-file-system/legacy'.
    // `overwrite`, weil beim zweiten Export sonst die vorherige Datei im Weg ist.
    const file = new File(Paths.cache, 'pk-termin.ics');
    file.create({ overwrite: true });
    file.write(ics);

    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/calendar',
      dialogTitle: 'Termin in Kalender eintragen',
      UTI: 'public.calendar-event',
    });
  }
}

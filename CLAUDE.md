# FussballApp – Claude Kontext

## Projekt
PK Fußballschule Buchungs-App. Spieler buchen Trainingstermine, Trainer/Admin verwaltet diese.

**Stack:** React Native · Expo · TypeScript · Supabase (PostgreSQL + Auth + Edge Functions)  
**Plattformen:** iOS, Android, Web (Admin-UI primär Web/PC)  
**Repo:** PhilipZahnjel/FussballApp — nach jeder Änderung committen und pushen.  
**Supabase-Projekt:** `mgdrbgtsaqhgrdsnpasv` (EU Central)

---

## Rollen & Zugriff

Zwei Rollen in `profiles.role`:
- `'admin'` → sieht Admin-Dashboard (PC/Web-Layout, Sidebar-Navigation)
- `'customer'` → sieht Kunden-App (Mobile-Layout, Bottom-Navigation)

**Login-Flow:** Nach Login wird `profiles.role` abgefragt. Admin → `AdminApp`, Kunde → normale App. Während Rollenabfrage läuft: Ladekreis.

**Wichtig:** Admin-UI wird im Vollbild gerendert (kein 430px-Container). Kunden-App ist auf 430px begrenzt (Mobile-Feel im Browser).

**Admin-Account:** `philip@zahnjel.de`

---

## Datenbankstruktur

```
profiles: {
  id, full_name, email, phone, birth_date, address,
  customer_number (int, auto-increment ab 101),
  is_active (bool),
  role ('admin'|'customer'),
  level ('anfaenger'|'amateur'|'profi'|'experte' | NULL),
  can_book_individual (bool), can_book_gruppe (bool),
  can_book_athletik (bool), can_book_torhueter_individual (bool),
  can_book_torhueter_gruppe (bool)
}

appointments: {
  id, user_id, date (YYYY-MM-DD), time (HH:MM),
  status ('confirmed'|'cancelled'), program, created_at
}

cancellation_tokens: {
  id, user_id, category ('individual'|'gruppe'),
  issued_at, expires_at (issued_at + 1 Monat),
  used_at (NULL = unbenutzt), source_appointment_id
}
```

**RLS:** `is_admin()` Funktion (SECURITY DEFINER) prüft Rolle ohne Rekursion.  
Admins dürfen alle Zeilen lesen/schreiben. Kunden nur eigene.

---

## Buchungsregeln (kritisch — gilt für Kunden)
- Max. **2 bestätigte Termine pro Tag** pro Nutzer (keine Ausnahmen).
- Wochenenden (Sa + So) und deutsche Bundesfeiertage nicht buchbar.
- **Buchungsberechtigung:** Kunde kann nur Programme buchen, für die Admin das Flag gesetzt hat (`can_book_*`).
- **Stornierungstoken:** Bei Stornierung wird ein Token ausgestellt (gleiche Kategorie, 1 Monat gültig). Token erlaubt eine zusätzliche Buchung (kein separates Kontingent — Token sind das einzige Buchungslimit).
- **Standorte (Rüsselsheim/Kelsterbach/Groß-Gerau):** Standort hängt am `trainer_schedules`-Slot (`location`, nullable). Admin setzt ihn pro Zelle im Zeitplan-Raster (Zyklus Aus→Rüsselsheim→Kelsterbach→Groß-Gerau). Im Buchungs-Flow filtert der Kunde die freien Slots nach Standort (Default „Alle"); ein Tag kann mehrere Standorte haben. Kanonische Liste: `LOCATIONS` in `src/constants/studio.ts` (Typ `Location`); DB-seitig in 3 CHECK-Constraints + `book_with_token` dupliziert. `book_with_token(p_location)` wählt einen Trainer **an diesem Standort** und speichert `appointments.location`; Kapazität/Trainerwahl/`check_slot_capacity` sind pro Standort. Rückwärtskompatibel: `location = NULL` = bisheriges Verhalten (alte Signaturen bleiben als Wrapper). Anzeige in Bestätigung, „Meine Termine" und E-Mails. Kunde ändert seinen Standort NICHT im Profil.
- **Nachholtermin-Storno-Limit:** Per Token gebuchte Termine sind `is_makeup = true` und tragen einen Ketten-Zähler `makeup_count`. Ein Kunde darf einen Nachholtermin **max. zweimal** stornieren-und-neu-buchen (`makeup_count` 0 und 1); ab `makeup_count >= 2` lehnt `cancel_and_issue_token` die Kunden-Stornierung ab (nur Admin). Ein **Admin-Storno eines Nachholtermins stellt keinen neuen Token aus** (verhindert die Endlosschleife).
- Slot-Kapazität per DB-Trigger (Individual: 1, Gruppe/Athletik/Torwart-Gruppe: 4).

**Admin bucht ohne Einschränkungen** (`addAppointmentForCustomer` überspringt alle Checks).

---

## Trainingstypen & Farben
| ID | Name | Kapazität | Kategorie | Farbe |
|---|---|---|---|---|
| `individual` | Individualtraining | 1 | individual | `#4A8FE8` |
| `gruppe` | Gruppentraining | 4 | gruppe | `#3DBFA0` |
| `athletik` | Athletiktraining | 4 | gruppe | `#F5A84A` |
| `torhueter_individual` | Torwart Individual | 1 | individual | `#E87676` |
| `torhueter_gruppe` | Torwart Gruppe | 4 | gruppe | `#9B59B6` |

---

## Level-System
| ID | Label | Farbe |
|---|---|---|
| `anfaenger` | Anfänger | `#4CAF50` (Grün) |
| `amateur` | Amateur | `#FFC107` (Gelb) |
| `profi` | Profi | `#FF9800` (Orange) |
| `experte` | Experte | `#F44336` (Rot) |

Level wird vom Admin im Kundenprofil gesetzt. Kunden sehen ihr Level nicht.

---

## Admin-UI (`src/admin/`)

**Screens:**
- `DashboardScreen` — Statistiken, nächste 10 Termine aller Kunden
- `KundenScreen` — Suchfeld + Kundenliste (mit Level-Badge), "Neuen Kunden anlegen"-Formular
- `KundenDetailScreen` — Profil, Level-Chips, Buchungsberechtigungen (5 Toggles), Termine buchen/stornieren
- `TerminkalenderScreen` — Wochenansicht aller Termine

**Hook:** `useAdminData` in `src/admin/hooks/useAdminData.ts`  
Funktionen: `cancelAppointment`, `addAppointmentForCustomer`, `createCustomer`, `deleteCustomer`, `saveCustomerLevel`, `saveBookingPermissions`

---

## Kundenerstellung (Edge Function)
**Funktion:** `create-customer` (Supabase Edge Function, `verify_jwt: false`)  
**Ablauf:** Admin füllt Formular → Edge Function erstellt Auth-User mit temporärem Passwort → Profil wird angelegt → Passwort wird **inline in der UI angezeigt** (kein E-Mail-Versand, kein `Alert.alert()`).  
**Aufruf:** `supabase.functions.invoke('create-customer', { body: params })`

---

## Hooks & State (Kunden-App)
- `useAppointments(profile)` → `slotCounts` (anonyme Kapazität via RPC) + `slotPlayers` (anonyme Spielerinfos via RPC) + `myAppointments` (nur eigene) + `activeTokens` (unbenutzte Tokens)
- `useProfile` → Profil inkl. `role`, `level`, `can_book_*`
- `TermineScreen` bekommt `myAppointments` + `activeTokens`
- `BuchenScreen` bekommt `slotCounts`, `slotPlayers`, `myAppointments`, `profile`, `activeTokens`

---

## UI-Regeln
- **Kein `Alert.alert()` für Web** — stattdessen inline UI-Komponenten (State + JSX)
- Kein Hover-Effekt in Kalender-Komponenten (Touch-Bugs auf Mobile)
- Vergangene Termine werden ausgegraut (`opacity: 0.5`) — unabhängig von `status`
- Admin-Farben: Sidebar `#1C2133`, Hintergrund `#F4F6F9`, Akzent `#5A8C6A`
- Kunden-Farben: Gradient `C.bgTop → C.bgBot`, Akzent `#5A8C6A`

---

## Bekannte Fallstricke
- Demo-User **nie per SQL in `auth.users` anlegen** — fehlende Pflichtfelder brechen den Login
- Edge Functions die selbst Auth prüfen: `verify_jwt: false` setzen
- `supabase.functions.invoke()` verwenden, nie manuelles `fetch()` mit konstruierter URL
- Admin-Layout muss aus dem 430px-Container heraus — eigener Render-Pfad in `App.tsx` vor `appContent`
- `PROGRAM_CATEGORY[program as ProgramId]` für Kategorie-Bestimmung aus program-String

# TermineApp — Projektdokumentation

## Inhaltsverzeichnis

1. [Projektübersicht](#projektübersicht)
2. [Ordnerstruktur](#ordnerstruktur)
3. [Technologie-Stack](#technologie-stack)
4. [Konfigurationsdateien](#konfigurationsdateien)
5. [Datenbank & Backend (Supabase)](#datenbank--backend-supabase)
6. [Sicherheit](#sicherheit)
7. [Kunden-App](#kunden-app)
8. [Admin-Bereich](#admin-bereich)
9. [Edge Functions](#edge-functions)
10. [Tests](#tests)
11. [App starten & bauen](#app-starten--bauen)

---

## Projektübersicht

EMS-Studio Buchungs-App für ein EMS-Fitnessstudio.

**Zwei Bereiche:**
- **Kunden-App** — Kunden buchen Trainingstermine, sehen ihre Termine und Körpermessungen
- **Admin-Bereich** — Betreiber verwaltet Kunden, Termine, Bankdaten und SEPA-Lastschriften

**Plattformen:** iOS, Android, Web-Browser (Admin primär Web/PC)

---

## Ordnerstruktur

```
TermineApp/
│
├── App.tsx                    Einstiegspunkt — startet Admin oder Kunden-App
├── app.json                   Expo-Konfiguration (App-Name, Icons, etc.)
├── babel.config.js            Build-Konfiguration
├── tsconfig.json              TypeScript-Einstellungen
│
├── jest.config.js             Test-Konfiguration
├── jest.setup.ts              Setup für Integration-Tests
├── jest.setup.unit.ts         Setup für Unit-Tests (ohne React Native)
│
├── package.json               Abhängigkeiten & Befehle (npm start, npm test)
├── package-lock.json          Fixierte Versionen aller Abhängigkeiten
│
├── .env                       Geheime Schlüssel — NICHT in Git! (lokal)
├── .env.example               Vorlage für .env (zeigt welche Keys gebraucht werden)
├── .gitignore                 Dateien die Git ignoriert (.env, node_modules, dist)
│
├── DOKUMENTATION.md           Diese Datei
├── LERNPLAN.md                Lernplan zu den genutzten Konzepten
├── CLAUDE.md                  Anweisungen für den KI-Assistenten
│
├── supabase.exe               Supabase CLI (Deploy-Tool, lokal)
│
├── web/
│   └── index.html             Web-Vorlage mit Sicherheits-Headern (CSP etc.)
│
├── .vscode/
│   ├── settings.json          VS Code: Deno-Support für Edge Functions
│   └── extensions.json        Empfohlene VS Code Erweiterung (Deno)
│
├── supabase/
│   ├── config.toml            Supabase-Konfiguration (lokal & deployed)
│   └── functions/             Server-Funktionen (laufen auf Supabase-Servern)
│       ├── create-customer/   Kunden anlegen (Auth-User + Profil)
│       ├── delete-customer/   Kunden löschen (Auth-User + alle Daten)
│       ├── send-booking-email/     Buchungsbestätigung per E-Mail
│       ├── send-cancellation-email/ Storno-Bestätigung per E-Mail
│       └── send-reminders/    Tägliche Terminerinnerungen
│
└── src/
    ├── __tests__/             Automatische Tests (npm test)
    │   ├── bookingRules.test.ts
    │   ├── validation.test.ts
    │   ├── sepa.test.ts
    │   ├── performance.test.ts
    │   └── useAdminData.test.ts
    │
    ├── admin/                 Admin-Bereich (separates App-Modul)
    │   ├── AdminApp.tsx       Admin-Einstieg: Sidebar + Navigation
    │   ├── hooks/
    │   │   └── useAdminData.ts  Alle Admin-Datenbankoperationen
    │   ├── screens/           Admin-Seiten
    │   │   ├── DashboardScreen.tsx    Statistiken & nächste Termine
    │   │   ├── KundenScreen.tsx       Kundenliste + Kunden anlegen
    │   │   ├── KundenDetailScreen.tsx Kundenprofil, Termine, Bankdaten
    │   │   ├── TerminkalenderScreen.tsx Wochenansicht aller Termine
    │   │   └── FinanzenScreen.tsx     SEPA-Export
    │   └── utils/
    │       └── sepa.ts        SEPA pain.008 XML-Generator
    │
    ├── components/            Wiederverwendbare UI-Bausteine
    │   ├── BottomNav.tsx      Tab-Navigation unten (Kunden-App)
    │   ├── Btn.tsx            Button (primary / ghost / red)
    │   ├── Card.tsx           Weiße Karte mit Schatten
    │   └── GlassCard.tsx      Karte mit Glaseffekt
    │
    ├── constants/             Feste Werte die überall genutzt werden
    │   ├── colors.ts          Farbpalette der App
    │   ├── i18n.ts            Deutsche Texte & Datumsfunktionen
    │   ├── programs.ts        4 EMS-Programme (muscle, lymph, relax, metabolism)
    │   └── slots.ts           Verfügbare Buchungszeiten
    │
    ├── hooks/                 Datenlogik der Kunden-App
    │   ├── useAppointments.ts Termine laden, buchen, stornieren
    │   ├── useProfile.ts      Kundenprofil laden
    │   └── useMeasurements.ts Körpermessungen laden
    │
    ├── lib/
    │   └── supabase.ts        Datenbank-Verbindung (mit sicherem Session-Storage)
    │
    ├── screens/               Seiten der Kunden-App
    │   ├── LoginScreen.tsx    Anmeldung
    │   ├── HomeScreen.tsx     Dashboard mit nächstem Termin
    │   ├── TermineScreen.tsx  Alle Termine des Kunden
    │   ├── BuchenScreen.tsx   Buchungs-Assistent (4 Schritte)
    │   ├── MessungenScreen.tsx Körpermessungen & Kalorienrechner
    │   └── ProfilScreen.tsx   Profil, Bankdaten, Abmelden
    │
    ├── types/
    │   └── index.ts           TypeScript-Typen (Tab, Appointment, etc.)
    │
    └── utils/                 Hilfsfunktionen (reine Logik, kein UI)
        ├── bookingRules.ts    Buchungslogik: Konflikte, Kapazität, Feiertage
        ├── calendar.ts        .ics Kalender-Export
        └── validation.ts      IBAN (ISO 7064) und BIC Validierung
```

---

## Technologie-Stack

| Technologie | Version | Zweck |
|---|---|---|
| React Native | 0.74.5 | UI-Framework für iOS, Android und Web |
| Expo | 51.0.28 | Build-Tool und native Bibliotheken |
| TypeScript | 5.3.3 | Typsicherheit — verhindert viele Fehler |
| Supabase JS | 2.x | Client für Datenbank, Auth und Edge Functions |
| Deno | 2 | Laufzeitumgebung für Edge Functions |
| Jest | 29 | Test-Framework |

---

## Konfigurationsdateien

### `app.json`
Expo-Einstellungen: App-Name, Bundle-ID, Hintergrundfarbe, Orientierung (nur Hochformat).

### `babel.config.js`
Transpiler-Einstellungen. Wandelt modernen TypeScript-Code in browserfähiges JavaScript um.

### `tsconfig.json`
TypeScript-Einstellungen. Strikter Modus aktiviert.
Pfad-Alias: `@/` zeigt auf `./src/` (z.B. `import { C } from '@/constants/colors'`).

### `.env`
Enthält geheime Schlüssel. Wird von Git ignoriert (steht in `.gitignore`).
```
EXPO_PUBLIC_SUPABASE_URL=https://...supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```
`EXPO_PUBLIC_` Präfix macht die Variable im App-Code verfügbar.

### `web/index.html`
HTML-Vorlage für den Web-Build. Enthält Sicherheits-Header:
- **Content-Security-Policy** — erlaubt nur vertrauenswürdige Scripts
- **X-Frame-Options DENY** — verhindert Einbettung in fremde Seiten (Clickjacking)
- **X-Content-Type-Options** — verhindert MIME-Sniffing

---

## Datenbank & Backend (Supabase)

### Tabellen

**`profiles`** — Nutzerprofile
```
id              UUID (= auth.users.id)
full_name       Text
email           Text
phone           Text
birth_date      Text (YYYY-MM-DD)
address         Text
customer_number Integer (automatisch ab 101)
is_active       Boolean
role            'admin' oder 'customer'
iban, bic, account_holder, bank_name   Bankverbindung
mandate_reference, mandate_date        SEPA-Mandat
```

**`appointments`** — Termine
```
id        UUID
user_id   UUID (→ profiles.id)
date      Text (YYYY-MM-DD)
time      Text (HH:MM)
status    'confirmed' oder 'cancelled'
program   'muscle' | 'lymph' | 'relax' | 'metabolism'
```

**`measurements`** — Körpermessungen
```
id, user_id, measured_at
weight, height, body_fat, muscle_mass, water, bone_mass
chest, hip, waist, arms, legs, visceral_fat, bmr
```

**`charges`** — Buchungen / Rechnungen
```
id, user_id, amount, description
period    YYYY-MM
status    'pending' | 'collected' | 'failed'
```

### Zugriffsrechte (Row Level Security)

Admins dürfen alles lesen und schreiben.
Kunden dürfen nur ihre eigenen Zeilen lesen und schreiben.
Die Prüfung passiert in der Datenbank — kein App-Code kann sie umgehen.

### Buchungsregeln
- Max. **1 bestätigter Termin pro Tag** pro Kunde
- **Ausnahme:** Lymphdrainage (`program: 'lymph'`) darf zusätzlich gebucht werden
- Max. **2 Personen pro Zeitslot**
- Wochenenden und deutsche Bundesfeiertage nicht buchbar
- Vergangene Zeitslots am heutigen Tag nicht buchbar

---

## Sicherheit

### Umgesetzte Maßnahmen

| Maßnahme | Schutz gegen | Ort |
|---|---|---|
| HTTPS (am Server aktivieren) | Abhören von Daten | Hosting-Konfiguration |
| Content-Security-Policy | XSS (Script-Einschleusung) | `web/index.html` |
| X-Frame-Options DENY | Clickjacking | `web/index.html` |
| API Keys in `.env` | Secrets im Git-Repository | `.env` + `.gitignore` |
| expo-secure-store | Token-Diebstahl auf Mobil | `src/lib/supabase.ts` |
| sessionStorage (Web) | Token bleibt nur im Tab | `src/lib/supabase.ts` |
| IBAN-Prüfsumme ISO 7064 | Fehleingaben | `src/utils/validation.ts` |
| BIC-Format-Validierung | Fehleingaben | `src/utils/validation.ts` |
| Row Level Security | Datenzugriff | Supabase Dashboard |
| verify_jwt = false + manuelle Prüfung | Unberechtigte Edge Function Aufrufe | `supabase/config.toml` |
| Inline-Fehlermeldungen | kein Alert.alert() auf Web | `KundenDetailScreen.tsx` |

### Noch zu tun
- **HTTPS am Server aktivieren** — im Hosting-Panel des Anbieters SSL-Zertifikat aktivieren

---

## Kunden-App

### Login-Ablauf
1. `App.tsx` prüft beim Start ob eine Session existiert
2. Keine Session → `LoginScreen` anzeigen
3. Login erfolgreich → Rolle aus `profiles.role` laden
4. `role === 'admin'` → `AdminApp`
5. `role === 'customer'` → Kunden-App mit `BottomNav`

### Screens

**`LoginScreen`** — E-Mail + Passwort, Fehleranzeige inline

**`HomeScreen`** — Begrüßung, nächster Termin, letzte Messung

**`TermineScreen`** — bevorstehende und vergangene Termine, Stornieren, Kalender-Export (.ics)

**`BuchenScreen`** — 4-Schritte-Assistent:
1. Programm wählen (muscle / lymph / relax / metabolism)
2. Datum wählen (Kalender, Feiertage/Wochenenden gesperrt)
3. Uhrzeit wählen (vergangene Slots am heutigen Tag ausgegraut)
4. Bestätigen

**`MessungenScreen`** — Gewicht, Körperfett, Umfänge, Kalorienrechner

**`ProfilScreen`** — Profil, Bankdaten, Passwort ändern, Abmelden

### Hooks (Datenlogik)

**`useAppointments`** — lädt alle Termine (für Kapazitätsprüfung) und eigene Termine, buchen, stornieren

**`useProfile`** — Profil des eingeloggten Kunden

**`useMeasurements`** — alle Messungen, neueste Messung

---

## Admin-Bereich

### Einstieg
`AdminApp.tsx` — rendert die Sidebar und den aktuellen Screen.
Sidebar ist einklappbar (Icon-only auf schmalen Bildschirmen).

### Screens

**`DashboardScreen`** — Statistiken (Anzahl Kunden, Termine heute), nächste Termine aller Kunden

**`KundenScreen`** — Kundenliste mit Suche, neuen Kunden anlegen (zeigt temporäres Passwort inline)

**`KundenDetailScreen`** — Vollständiges Kundenprofil:
- Kontaktdaten
- Bankverbindung bearbeiten (mit IBAN-Prüfsummen-Validierung)
- SEPA-Mandat bearbeiten
- Termine buchen und stornieren
- Kunden unwiderruflich löschen (mit Bestätigungsdialog)

**`TerminkalenderScreen`** — Wochenansicht aller Termine, farblich nach Programm

**`FinanzenScreen`** — SEPA pain.008 XML-Datei generieren und herunterladen

### Hook: `useAdminData`
Zentraler Hook für alle Admin-Datenbankoperationen:

| Funktion | Was sie macht |
|---|---|
| `cancelAppointment(id)` | Termin auf 'cancelled' setzen |
| `addAppointmentForCustomer(userId, date, time, program)` | Termin für Kunden buchen (mit Konfliktprüfung) |
| `saveBankDetails(customerId, data)` | Bankverbindung speichern |
| `saveMandate(customerId, ref, date)` | SEPA-Mandat speichern |
| `addCharge(userId, amount, description, period)` | Buchung/Rechnung anlegen |
| `createCustomer(params)` | Neuen Kunden anlegen (ruft Edge Function auf) |
| `deleteCustomer(customerId)` | Kunden löschen (ruft Edge Function auf) |

---

## Edge Functions

Laufen auf Supabase-Servern in Deno/TypeScript.
Werden aus der App mit `supabase.functions.invoke('name', { body: ... })` aufgerufen.

### `create-customer`
Legt einen neuen Auth-User an und erstellt das Profil.
Gibt ein temporäres Passwort zurück das im Admin angezeigt wird.
`verify_jwt: false` — prüft Admin-Rolle selbst.

### `delete-customer`
Löscht in dieser Reihenfolge: charges → measurements → appointments → profile → auth.users
`verify_jwt: false` — prüft Admin-Rolle selbst über den mitgeschickten Authorization-Header.

### `send-booking-email`
Sendet HTML-Buchungsbestätigung per E-Mail (IONOS SMTP via Nodemailer, `smtp.ionos.de:587`).
Umgebungsvariablen: `GMAIL_USER` (= IONOS-E-Mail), `GMAIL_PASS` (= IONOS App-Passwort)

### `send-cancellation-email`
Sendet Storno-Bestätigung per E-Mail.

### `send-reminders`
Läuft täglich. Sucht alle Termine von morgen und schickt Erinnerungen.

### Edge Function deployen
```bash
# Im Projektordner:
./supabase.exe functions deploy delete-customer --no-verify-jwt
./supabase.exe functions deploy create-customer --no-verify-jwt
./supabase.exe functions deploy send-booking-email
```

---

## Tests

**78 automatische Tests** die mit `npm test` ausgeführt werden.

### Test-Dateien

| Datei | Tests | Was getestet wird |
|---|---|---|
| `bookingRules.test.ts` | 26 | Buchungskonflikte, Lymph-Ausnahme, Kapazität, Feiertage (2024–2030), Wochenenden |
| `validation.test.ts` | 14 | IBAN ISO 7064 Prüfsumme, BIC-Format, Grenzwerte |
| `sepa.test.ts` | 11 | pain.008 XML-Struktur, Betragsberechnung, Mehrtransaktionen |
| `performance.test.ts` | 11 | 500 Kunden filtern, 1000 Konfliktchecks in < 50ms |
| `useAdminData.test.ts` | 16 | Edge Function Aufrufe, DB-Operationen, Fehlerbehandlung |

### Befehle
```bash
npm test                 # alle Tests ausführen
npm run test:coverage    # Tests + Abdeckungsbericht
npm run test:watch       # automatisch bei Codeänderungen
```

---

## App starten & bauen

### Entwicklung
```bash
npm start          # startet Expo (zeigt QR-Code für Handy)
npm run web        # nur im Browser öffnen
npm run android    # auf Android-Gerät/Emulator
npm run ios        # auf iOS-Gerät/Simulator
```

### Für Produktion bauen (Web)
```bash
npx expo export --platform web
```
Erstellt den `dist/` Ordner → diesen per FileZilla auf den Server hochladen.

### Wichtig nach Code-Änderungen
1. `npx expo export --platform web` — neuen dist-Ordner erstellen
2. `dist/` per FileZilla hochladen
3. `git add . && git commit -m "..." && git push` — Änderungen sichern

---

*Dokumentation Stand April 2026*

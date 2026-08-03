# Lernplan — EMS Studio App

Aufgebaut von Grundlagen nach oben. Jede Phase baut auf der vorherigen auf.
Zeitangaben gelten für ca. 1 Stunde Lernzeit pro Tag.

---

## Übersicht

| Phase | Thema | Dauer |
|---|---|---|
| 1 | Wie das Internet funktioniert | 1–2 Wochen |
| 2 | Datenbanken & Supabase | 2–3 Wochen |
| 3 | Web-Sicherheit | 2–3 Wochen |
| 4 | App-Architektur & React | 3–4 Wochen |
| 5 | Testing | 2 Wochen |
| 6 | Tools im Überblick | parallel lernen |

---

## Phase 1 — Wie das Internet funktioniert

Das ist das Fundament für alles andere.
Ohne dieses Wissen verstehst du weder Sicherheit noch Architektur.

### Was du lernen sollst

**Der Weg einer Anfrage:**
- Was passiert wenn du eine URL eintippst? (DNS → TCP → HTTP → Antwort)
- Was ist ein Server, was ist ein Browser, was ist der Unterschied?
- Was sind IP-Adressen und Domain-Namen (z.B. `zahnjel.de` → IP `185.x.x.x`)?

**HTTP verstehen:**
- Was ist eine HTTP-Anfrage (Request) und eine Antwort (Response)?
- Was sind Header? (z.B. `Content-Type`, `Authorization`)
- Was bedeuten Status-Codes? (`200` = OK, `401` = nicht eingeloggt, `403` = keine Erlaubnis, `500` = Serverfehler)
- Was ist der Unterschied zwischen `GET` (lesen) und `POST` (senden)?

**HTTPS verstehen:**
- Warum ist HTTP unsicher? (Daten im Klartext)
- Wie funktioniert HTTPS? (TLS-Verschlüsselung, Zertifikate)
- Was ist ein SSL-Zertifikat und wer stellt es aus? (z.B. Let's Encrypt)

### Warum das für dein Projekt relevant ist
- Deine App liegt auf einem Server unter `zahnjel.de`
- Jede Supabase-Anfrage ist ein HTTP-Request an `https://...supabase.co`
- Das HTTPS-Problem das wir besprochen haben wird vollständig verständlich

### Ressourcen
- cs.fyi/guide/how-does-internet-work — kostenlos, ca. 1 Stunde
- MDN Web Docs: "Überblick über HTTP" (auf Deutsch verfügbar)
- YouTube: "How does the Internet work?" von Fireship (7 Minuten, sehr gut)

---

## Phase 2 — Datenbanken & Supabase

Supabase ist das Herzstück deines Projekts — hier liegen alle Daten.

### Was du lernen sollst

**Grundlagen Datenbanken:**
- Was ist eine relationale Datenbank? (Tabellen, Zeilen, Spalten)
- Was ist ein Primärschlüssel? (eindeutige ID für jede Zeile)
- Was ist ein Fremdschlüssel? (Verbindung zwischen Tabellen, z.B. `appointments.user_id` zeigt auf `profiles.id`)
- Was ist eine Abfrage (Query)?

**SQL — die Sprache der Datenbanken:**
```sql
-- Alle Termine eines Kunden lesen
SELECT * FROM appointments WHERE user_id = '...' AND status = 'confirmed';

-- Termin stornieren
UPDATE appointments SET status = 'cancelled' WHERE id = '...';

-- Termin erstellen
INSERT INTO appointments (user_id, date, time, program) VALUES ('...', '2026-06-01', '09:00', 'muscle');

-- Termin löschen
DELETE FROM appointments WHERE id = '...';
```

**Supabase spezifisch:**
- Was ist Supabase? (PostgreSQL + REST-API + Authentifizierung + Edge Functions)
- Was ist Row Level Security (RLS)? — das wichtigste Sicherheitskonzept
  - Admins dürfen alle Zeilen lesen/schreiben
  - Kunden dürfen nur ihre eigenen Daten sehen
  - Wird direkt in der Datenbank erzwungen — kein Code kann es umgehen
- Was ist ein JWT-Token? (wird nach dem Login ausgegeben, beweist die Identität)
- Was ist der Unterschied zwischen Anon-Key und Service-Role-Key?
  - Anon-Key: darf nur das was RLS erlaubt → im App-Code ok
  - Service-Role-Key: umgeht RLS, hat vollen Zugriff → NUR in Edge Functions, NIE im App-Code
- Was ist eine Edge Function? (kleines Programm das auf Supabase-Servern läuft)

### In deinem Projekt angewendet
- `profiles`, `appointments`, `charges`, `measurements` — deine Tabellen
- `create-customer` Edge Function nutzt Service-Role-Key um Auth-User anzulegen
- `delete-customer` Edge Function löscht Auth-User + alle Daten sicher

### Ressourcen
- SQLBolt.com — interaktives SQL-Tutorial, kostenlos, ca. 3 Stunden
- Supabase Docs → "Quickstart" und "Row Level Security"
- YouTube: "Supabase in 100 Seconds" von Fireship

---

## Phase 3 — Web-Sicherheit ⭐ Deine wichtigste Phase

Das hast du selbst als Priorität genannt.
Hier sind die Konzepte hinter allen Sicherheitsmaßnahmen in deinem Projekt.

### Was du lernen sollst

**Die häufigsten Angriffe:**

**XSS — Cross-Site Scripting**
Ein Angreifer schleust JavaScript-Code in deine Seite ein.
Dieser Code läuft dann im Browser des Opfers und kann alles stehlen.
→ Warum wir `Content-Security-Policy` eingebaut haben: Sie legt fest welche Scripts überhaupt ausgeführt werden dürfen.

**MITM — Man-in-the-Middle**
Jemand im gleichen Netzwerk (Café-WLAN, Hotel) fängt deinen Datenverkehr ab.
Bei HTTP sieht er alles im Klartext. Bei HTTPS ist alles verschlüsselt.
→ Warum HTTPS für deine App mit Kundendaten und IBAN Pflicht ist.

**CSRF — Cross-Site Request Forgery**
Eine fremde Webseite löst in deinem Namen Aktionen aus
(z.B. Kunden löschen) weil dein Browser automatisch Cookies mitschickt.
→ Warum Sicherheitsheader wie `X-Frame-Options DENY` wichtig sind.

**SQL-Injection**
Ein Angreifer schreibt SQL-Code in ein Eingabefeld.
Wenn dieser Code direkt in eine Datenbank-Abfrage kommt, kann er alles löschen oder auslesen.
→ Warum du immer parametrisierte Abfragen nutzen sollst (Supabase macht das automatisch).

**Brute-Force**
Ein Angreifer probiert automatisiert tausende Passwörter aus.
→ Supabase hat Rate-Limiting eingebaut (max. 30 Login-Versuche pro 5 Minuten).

**Schutzmaßnahmen in deinem Projekt:**

| Maßnahme | Schutz gegen | Wo im Code |
|---|---|---|
| HTTPS | MITM | Server-Konfiguration |
| Content-Security-Policy | XSS | `dist/index.html` |
| X-Frame-Options DENY | Clickjacking | `dist/.htaccess` |
| expo-secure-store | Token-Diebstahl (Mobil) | `src/lib/supabase.ts` |
| sessionStorage statt localStorage | XSS (Web) | `src/lib/supabase.ts` |
| API Keys in .env | Secrets im Code | `.env` + `.gitignore` |
| IBAN-Prüfsumme (ISO 7064) | Fehleingaben | `src/utils/validation.ts` |
| RLS in Supabase | Datenzugriff | Supabase Dashboard |
| verify_jwt in Edge Functions | Unautorisierte Aufrufe | `supabase/config.toml` |

### Ressourcen
- OWASP Top 10 — owasp.org (die 10 häufigsten Web-Sicherheitslücken, Pflichtlektüre)
- "Web Security for Developers" — Buch von Malcolm McDonald (ca. 200 Seiten, sehr praxisnah)
- MDN Web Docs: "Web Security" (kostenlos)

---

## Phase 4 — App-Architektur & React

Wie ist deine App aufgebaut und warum genau so.

### Was du lernen sollst

**Das 3-Schichten-Modell deiner App:**
```
┌─────────────────────────────────────┐
│  UI (Screens & Komponenten)         │  Was der Nutzer sieht
│  HomeScreen, BuchenScreen, ...      │
├─────────────────────────────────────┤
│  Datenlogik (Hooks)                 │  Was die App berechnet
│  useAdminData, useAppointments, ... │
├─────────────────────────────────────┤
│  Datenbank (Supabase)               │  Wo Daten gespeichert sind
│  PostgreSQL + Auth + Edge Functions │
└─────────────────────────────────────┘
```

**React Grundkonzepte:**

*Komponenten* — wiederverwendbare UI-Bausteine:
```tsx
// Btn.tsx ist eine Komponente — sie kann überall genutzt werden
<Btn label="Buchen" variant="primary" onPress={handleBook} />
```

*Props* — Eingaben einer Komponente (von außen):
```tsx
// label, variant, onPress sind Props
function Btn({ label, variant, onPress }) { ... }
```

*State* — der interne Zustand einer Komponente:
```tsx
const [tab, setTab] = useState('home');
// tab ist der aktuelle Wert
// setTab ändert den Wert und zeichnet die Komponente neu
```

*useEffect* — Code der beim Laden oder bei Änderungen ausgeführt wird:
```tsx
useEffect(() => {
  // Wird einmal beim Starten ausgeführt
  loadCustomers();
}, []); // Das [] bedeutet: nur einmal
```

*Custom Hooks* — Datenlogik von der UI trennen:
```tsx
// useAdminData bündelt alle Admin-Datenbankoperationen
// KundenScreen muss sich nicht darum kümmern WIE Daten geladen werden
const { customers, createCustomer, deleteCustomer } = useAdminData();
```

**TypeScript — warum Typen wichtig sind:**
```typescript
// Ohne TypeScript: du merkst den Fehler erst wenn die App abstürzt
customer.namee // Tippfehler — kein Fehler beim Schreiben

// Mit TypeScript: Fehler wird sofort rot markiert
customer.namee // ❌ Property 'namee' does not exist on type 'CustomerProfile'
```

**Die Rollenlogik deiner App:**
```
App.tsx startet
    → Supabase Auth prüfen: Ist jemand eingeloggt?
        → Nein: LoginScreen anzeigen
        → Ja: Rolle aus profiles Tabelle laden
            → role === 'admin': AdminApp anzeigen (Vollbild, Sidebar)
            → role === 'customer': Kunden-App anzeigen (430px, BottomNav)
```

### Ressourcen
- react.dev → "Learn React" — interaktives Tutorial (kostenlos, ca. 4 Stunden)
- expo.dev/docs → "Introduction"
- TypeScript Handbook — typescriptlang.org/docs/handbook

---

## Phase 5 — Testing

Warum Tests existieren und was sie dir bringen.

### Was du lernen sollst

**Die Testpyramide:**
```
        ▲ Wenige, langsame Tests
        │  End-to-End Tests (Browser-Simulation)
        │  Integration Tests (Zusammenspiel von Teilen)
        │  Unit Tests (einzelne Funktion)
        ▼ Viele, schnelle Tests
```

**Unit Test** — testet eine einzige Funktion isoliert:
```typescript
// Testet nur validateIban — nichts anderes
test('gültige IBAN wird akzeptiert', () => {
  expect(validateIban('DE89370400440532013000')).toBeNull();
});
```

**Integration Test** — testet das Zusammenspiel:
```typescript
// Testet ob deleteCustomer die richtige Edge Function aufruft
test('deleteCustomer ruft delete-customer auf', async () => {
  await mockSupabase.functions.invoke('delete-customer', { body: { customerId: 'x' } });
  expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('delete-customer', ...);
});
```

**Was ein Mock ist:**
Ein Mock ist eine Simulation eines echten Systems.
Im Test willst du nicht wirklich Supabase aufrufen —
du willst nur prüfen ob der Code die richtigen Aufrufe macht.
```typescript
// Echter Supabase-Aufruf würde echte Daten löschen → gefährlich im Test
// Mock simuliert den Aufruf ohne echten Effekt
jest.mock('../lib/supabase', () => ({ ... }));
```

**Warum Tests wertvoll sind:**
- Du änderst Code → ein Test wird rot → du weißt sofort was kaputt ist
- Ohne Tests: du merkst Fehler erst wenn ein Kunde sich beschwert
- Unser Last-Test prüft 500 Kunden in unter 50ms — du weißt, dass die App bei Wachstum nicht langsam wird

**In deinem Projekt — 78 Tests:**

| Datei | Was getestet wird |
|---|---|
| `bookingRules.test.ts` | Buchungskonflikt-Logik, Feiertage, Kapazität |
| `validation.test.ts` | IBAN-Prüfsumme (ISO 7064), BIC-Format |
| `sepa.test.ts` | SEPA XML-Generierung, Beträge, Mehrtransaktionen |
| `performance.test.ts` | 500+ Kunden, 1000 Checks in < 50ms |
| `useAdminData.test.ts` | Edge Functions, DB-Operationen |

Tests ausführen:
```bash
npm test              # alle Tests
npm run test:coverage # mit Abdeckungsbericht
npm run test:watch    # automatisch bei Codeänderungen
```

### Ressourcen
- "JavaScript Testing Best Practices" — github.com/goldbergyoni/javascript-testing-best-practices
- Jest Dokumentation → jestjs.io/docs/getting-started

---

## Phase 6 — Tools im Überblick

Diese Tools lernst du am besten durch Benutzen, parallel zu den anderen Phasen.

### Entwicklungstools

| Tool | Zweck | Wann genutzt |
|---|---|---|
| **VS Code** | Code-Editor | täglich |
| **Git** | Versionskontrolle: speichert jeden Entwicklungsschritt | nach jeder Änderung |
| **GitHub** | Online-Speicher für Git-Repository | `git push` |
| **npm** | Paketmanager: installiert Bibliotheken | `npm install` |

### Projekt-Tools

| Tool | Zweck | Wo im Projekt |
|---|---|---|
| **Expo** | React Native Framework (iOS, Android, Web) | `app.json`, `npx expo start` |
| **TypeScript** | JavaScript mit Typen | alle `.ts`/`.tsx` Dateien |
| **Supabase CLI** | Datenbank & Edge Functions verwalten | `supabase.exe functions deploy` |
| **FileZilla** | Dateien auf den Server hochladen | `dist/` Ordner hochladen |
| **Jest** | Tests ausführen | `npm test` |

### Git — die wichtigsten Befehle

```bash
git status              # Was hat sich geändert?
git add datei.ts        # Datei zur nächsten Speicherung vormerken
git commit -m "Nachricht"  # Änderungen speichern
git push                # Zum GitHub hochladen
git log                 # Verlauf aller Änderungen anzeigen
```

### Empfohlene VS Code Erweiterungen

- **Deno** (denoland.vscode-deno) — für Edge Functions (bereits in `.vscode/extensions.json`)
- **ESLint** — zeigt Code-Probleme direkt im Editor
- **Prettier** — formatiert Code automatisch
- **GitLens** — zeigt wer welche Zeile wann geschrieben hat

---

## Empfohlene Reihenfolge

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
  Internet  Datenbank  Sicherheit  React    Tests

Phase 6 (Tools) parallel zu allen anderen Phasen
```

**Lerntipp:** Schau dir während du lernst den echten Code in deinem Projekt an.
Wenn du z.B. Row Level Security lernst, öffne das Supabase Dashboard
und schau dir deine echten RLS-Regeln an.
Theorie + Praxis zusammen festigt das Wissen deutlich schneller.

---

*Lernplan erstellt für das EMS Studio TermineApp Projekt — Stand April 2026*

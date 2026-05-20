# KI-Chatbot (FloatingChat) — Implementierungsplan

**Date:** 2026-05-20
**Status:** Draft
**Estimated Effort:** ~8–12 Stunden gesamt

---

## Overview

- **Problem**: Kunden haben einfache Fragen zur App (Buchungsregeln, Tokens, Termine), die sich
  ohne Admin-Eingriff beantworten lassen. Gleichzeitig soll der Admin entlastet werden.
- **Success Criteria**:
  - Floating-Button erscheint auf allen 5 Tabs der Kunden-App
  - Claude Haiku antwortet auf Deutsch innerhalb von 3 s (P90)
  - Bei Fragen zu Preisen / Beschwerden / Technischer Not verweist Bot auf +49 152 53148032
  - Konversationsverlauf bleibt für die Dauer der Session erhalten (in-memory)
  - Kein Absturz auf Web, kein `Alert.alert()`
- **Users Affected**: Kunden (customer role) — Admin sieht den Button nicht

---

## Technical Approach

### Architektur-Überblick

```
Kunde tippt Nachricht
  → useChatbot Hook
    → ChatService.send()
      → supabase.functions.invoke('chat-assistant', { messages })
        → Edge Function: Auth-Check (JWT) → Anthropic API (claude-haiku-4-5)
          → streamed/buffered Antwort zurück
  → UI aktualisiert sich
```

Kein DB-Speichern von Chat-Verläufen — alles in-memory im Hook-State.
Kein Realtime-Channel nötig — einfaches Request/Response.

### Entscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| Auth in Edge Function | `verify_jwt: true` (Standard) | Nur eingeloggte Kunden sollen chatten; JWT kommt automatisch via `supabase.functions.invoke` |
| Streaming | Nein — gebufferte Antwort | React Native ScrollView + Streaming-Parser ist überkomplex; Haiku ist schnell genug |
| Chat-Persistenz | In-memory (Hook-State) | Keine DB-Tabelle nötig; Chat-Verlauf ist ephemer |
| Model | `claude-haiku-4-5` | Günstig, schnell, für FAQ-Antworten ausreichend |
| Context-Window-Schutz | Max. 10 Nachrichten im Verlauf | Kostendeckelung; ältere Nachrichten werden gekürzt |
| Floating Button zIndex | Sehr hoher `zIndex` + `position: absolute` innerhalb `webInner`/`nativeRoot` | Muss über BottomNav liegen |

### Bestehende Dateien die verändert werden

| Datei | Änderung |
|---|---|
| `App.tsx` | `FloatingChatButton` + `ChatModal` innerhalb des eingeloggten Customer-Bereichs einbauen |

### Neue Dateien

```
supabase/functions/chat-assistant/
  index.ts
  config.json

src/services/chatService.ts
src/hooks/useChatbot.ts
src/components/chat/FloatingChatButton.tsx
src/components/chat/ChatModal.tsx
```

---

## Implementation Plan

### Phase 1: Backend (Edge Function)
**Goal:** Funktionierender API-Endpunkt, der Nachrichten entgegennimmt und Haiku-Antworten zurückgibt.

| Task | File(s) | Complexity | Depends On |
|------|---------|------------|------------|
| `ANTHROPIC_API_KEY` Secret in Supabase setzen | Supabase Dashboard → Settings → Secrets | Small | — |
| Edge Function `chat-assistant` erstellen | `supabase/functions/chat-assistant/index.ts` | Medium | Secret gesetzt |
| `config.json` für Edge Function (verify_jwt: true) | `supabase/functions/chat-assistant/config.json` | Small | — |
| Edge Function deployen und manuell mit curl testen | — | Small | index.ts fertig |

### Phase 2: Client-Schicht
**Goal:** Service + Hook, der die Edge Function aufruft und Nachrichten-State verwaltet.

| Task | File(s) | Complexity | Depends On |
|------|---------|------------|------------|
| `ChatService` erstellen | `src/services/chatService.ts` | Small | Phase 1 abgeschlossen |
| `useChatbot` Hook erstellen | `src/hooks/useChatbot.ts` | Small | ChatService |

### Phase 3: UI-Komponenten
**Goal:** Sichtbarer Floating Button + voll funktionsfähiges Chat-Modal.

| Task | File(s) | Complexity | Depends On |
|------|---------|------------|------------|
| `FloatingChatButton` Komponente | `src/components/chat/FloatingChatButton.tsx` | Small | useChatbot |
| `ChatModal` Komponente | `src/components/chat/ChatModal.tsx` | Medium | useChatbot |
| Integration in `App.tsx` | `App.tsx` | Small | Beide Komponenten fertig |

### Phase 4: Polish & Validation
**Goal:** Edge-Cases, Dark Mode, Error-Handling.

| Task | File(s) | Complexity | Depends On |
|------|---------|------------|------------|
| Dark-Mode-Farben in ChatModal prüfen | `ChatModal.tsx` | Small | Phase 3 |
| Fehlerfall inline anzeigen (kein Alert) | `ChatModal.tsx` | Small | Phase 3 |
| Eingabe bei leerem Text deaktivieren | `ChatModal.tsx` | Small | Phase 3 |
| Loading-Indikator (Typing-Dots) während API-Call | `ChatModal.tsx` | Small | Phase 3 |
| Keyboard-Verhalten auf Native prüfen (KeyboardAvoidingView) | `ChatModal.tsx` | Small | Phase 3 |

---

## Data Model Changes

Keine DB-Änderungen. Kein neues Table, keine Migration, kein RLS-Update nötig.

---

## API / Hook Design

### Edge Function: `chat-assistant`

**Endpunkt:** `POST /functions/v1/chat-assistant`
**Auth:** JWT-Pflicht (`verify_jwt: true` in config.json) — `supabase.functions.invoke` hängt automatisch den Session-Token an

**Request Body:**
```typescript
type ChatRequest = {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
};
```

**Response Body (200):**
```typescript
type ChatResponse = {
  reply: string;
};
// oder bei Fehler:
type ChatError = {
  error: string;
};
```

**System-Prompt-Struktur (in Edge Function hardcoded):**
```
Du bist der freundliche Assistent der PK Fußballschule App.
Antworte immer auf Deutsch, kurz und klar.

Was du weißt:
- Kunden buchen Trainingstermine: Individualtraining, Gruppentraining,
  Athletiktraining, Torwart Individual, Torwart Gruppe.
- Max. 2 bestätigte Termine pro Tag.
- Buchungen nur Mo–Fr, keine Feiertage.
- Der Admin setzt Buchungsberechtigungen pro Kunde (welche Programme buchbar sind).
- Stornierung erzeugt einen Nachholtoken (1 Monat gültig, gleiche Kategorie).
  Der Token erlaubt genau eine Nachholbuchung.
- Tokens sind das einzige Buchungslimit — es gibt kein separates monatliches Kontingent.

Was du NICHT weißt (verweise auf Kundenservice):
- Preise und Konditionen
- Technische Probleme (App startet nicht, Login fehlgeschlagen)
- Beschwerden und Reklamationen
- Individuelle Ausnahmen

Kundenservice: +49 152 53148032
Wenn eine Frage zu diesen Themen kommt: verweise freundlich auf die Nummer.
Erfinde keine Preise oder Regeln, die hier nicht stehen.
```

**Konversationsverlauf:** Die letzten 10 Nachrichten (messages-Array vom Client) werden direkt
an die Anthropic API weitergereicht. Ältere werden client-seitig im Hook gekürzt (FIFO).

**Edge Function vollständige Spezifikation:**
```typescript
// supabase/functions/chat-assistant/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
};

const SYSTEM_PROMPT = `...` // (vollständiger Text aus oben)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  // 1. Auth prüfen (verify_jwt: true greift bereits auf Supabase-Ebene,
  //    aber wir prüfen nochmals manuell für explizites 401)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Nicht autorisiert' }, 401);

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await callerClient.auth.getUser();
  if (!user) return json({ error: 'Nicht autorisiert' }, 401);

  // 2. Body parsen
  const { messages } = await req.json() as { messages: Array<{ role: string; content: string }> };
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'Ungültige Nachrichten' }, 400);
  }

  // 3. Anthropic API aufrufen
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) return json({ error: 'API-Schlüssel fehlt' }, 500);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: messages.slice(-10), // max. 10 Nachrichten
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Anthropic error:', err);
    return json({ error: 'KI momentan nicht erreichbar' }, 502);
  }

  const result = await response.json();
  const reply = result.content?.[0]?.text ?? 'Keine Antwort erhalten.';
  return json({ reply });
});
```

---

### ChatService: `src/services/chatService.ts`

Analog zu `emailService.ts` — dünne Wrapper-Schicht:

```typescript
import { supabase } from '../lib/supabase';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatResponse = { reply: string } | { error: string };

export const ChatService = {
  send: async (messages: ChatMessage[]): Promise<{ reply?: string; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: { messages },
      });
      if (error) return { error: error.message };
      const res = data as ChatResponse;
      if ('error' in res) return { error: res.error };
      return { reply: res.reply };
    } catch (e) {
      return { error: 'Verbindungsfehler' };
    }
  },
};
```

---

### Hook: `src/hooks/useChatbot.ts`

```typescript
export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type UseChatbotReturn = {
  messages: ChatMessage[];
  isOpen: boolean;
  loading: boolean;
  errorText: string | null;
  openChat: () => void;
  closeChat: () => void;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
};
```

Internes State-Modell:
- `messages: ChatMessage[]` — gesamter Verlauf (max. 20 Einträge)
- `isOpen: boolean` — Modal-Sichtbarkeit
- `loading: boolean` — während API-Call
- `errorText: string | null` — letzter Fehlertext

`sendMessage` Ablauf:
1. User-Nachricht an `messages` anhängen
2. `loading = true`, `errorText = null`
3. `ChatService.send(messages.slice(-10))` aufrufen
4. Bei Erfolg: Assistent-Antwort anhängen, `loading = false`
5. Bei Fehler: `errorText` setzen, `loading = false` (User-Nachricht bleibt im Verlauf)

Verlauf-Begrenzung: beim Anhängen auf max. 20 Nachrichten begrenzen (älteste 2 entfernen wenn > 20).

---

### Komponenten

#### `FloatingChatButton`

**Position:** `position: 'absolute'`, `bottom: 90`, `right: 20`
(90px = über BottomNav ~75px + 15px Abstand — BottomNav ist ca. 75px hoch)
Auf Native: `bottom: 90 + safeAreaInsets.bottom`

**Aussehen:**
- Kreis, 56×56px, `backgroundColor: C.accent` (`#152238` Light / `#4A8FE8` Dark)
- Icon: Chat-Sprechblase (SVG-freies Inline-View-Konstrukt wie in BottomNav)
- Wenn `isOpen`: X-Icon statt Chat-Icon (Button schließt dann Modal)
- `zIndex: 999`, `elevation: 10`
- `activeOpacity: 0.85`, kein Hover-Effekt

**Props:**
```typescript
interface FloatingChatButtonProps {
  isOpen: boolean;
  onPress: () => void;
}
```

#### `ChatModal`

**Verhalten:** Keine echte `Modal`-Komponente — stattdessen `position: 'absolute'` View
über dem Content (vermeidet Modal-over-Modal-Probleme auf Web und Native).
Breite: `100%` (innerhalb des 430px-Containers), Höhe: 65% des Containers.
Position: `bottom: 0`, aufgefaltet wenn `isOpen`.

Alternativ: React Native `Modal` mit `transparent={true}` und `animationType="slide"` —
das ist einfacher zu implementieren und vermeidet z-Index-Konflikte. Empfehlung: `Modal`
verwenden, da es auf Web (via react-native-web) korrekt funktioniert.

**Aufbau (von oben nach unten):**
1. **Header**: "Assistent" + X-Button (schließt Modal)
2. **Message-Liste**: `FlatList` oder `ScrollView` mit `ref` für Auto-Scroll nach unten
3. **Typing-Indikator**: 3 animierte Punkte wenn `loading === true`
4. **Fehler-Zeile**: rotes Inline-Text-Element wenn `errorText !== null`
5. **Kundenservice-Hinweis**: Fester Link am unteren Rand: "Fragen? +49 152 53148032"
   Als `Text` mit `onPress` → `Linking.openURL('tel:+4915253148032')`
6. **Input-Zeile**: `TextInput` + Send-Button

**Message-Bubbles:**
- User: rechtsbündig, `backgroundColor: C.accent`, weißer Text
- Assistant: linksbündig, `backgroundColor: C.card`, normaler Text (`C.text`)
- Bubble border-radius: 16px, Gegen-Seite: 4px (klassisches Chat-Look)

**TextInput-Verhalten:**
- `multiline={false}`, `returnKeyType="send"`, `onSubmitEditing` → sendMessage
- Send-Button deaktiviert wenn `loading` oder Input leer
- `KeyboardAvoidingView` um Input-Zeile (behavior: 'padding' auf iOS, 'height' auf Android)

**Props:**
```typescript
interface ChatModalProps {
  messages: ChatMessage[];
  isOpen: boolean;
  loading: boolean;
  errorText: string | null;
  onClose: () => void;
  onSend: (text: string) => Promise<void>;
}
```

---

## Integration in App.tsx

Der Chatbot gehört in den eingeloggten Customer-Bereich, nach `<BottomNav>` und vor Ende des
Fragments. Der `useChatbot` Hook wird in `AppInner` aufgerufen.

**Konkreter Einbaupunkt in `App.tsx` (Zeile ~166–207):**

```tsx
// 1. Import oben
import { FloatingChatButton } from './src/components/chat/FloatingChatButton';
import { ChatModal } from './src/components/chat/ChatModal';
import { useChatbot } from './src/hooks/useChatbot';

// 2. Hook in AppInner (nach bestehenden Hook-Aufrufen)
const { messages, isOpen, loading, errorText, openChat, closeChat, sendMessage } = useChatbot();

// 3. Im JSX-Block (innerhalb des role !== null Zweigs, nach <BottomNav>)
<>
  <View style={styles.screens}>
    {/* ... alle Tab-Screens wie bisher ... */}
  </View>
  <BottomNav tab={tab} setTab={setTab} />
  <FloatingChatButton isOpen={isOpen} onPress={isOpen ? closeChat : openChat} />
  <ChatModal
    messages={messages}
    isOpen={isOpen}
    loading={loading}
    errorText={errorText}
    onClose={closeChat}
    onSend={sendMessage}
  />
</>
```

Wichtig: `FloatingChatButton` und `ChatModal` kommen nach `<BottomNav>` — so liegen sie
im DOM/Render-Tree über der Navigation und brauchen nur `zIndex: 999`.
Der äußere Fragment-Container muss `position: 'relative'` haben (oder die Absolute-Positionierung
referenziert den nächsten positionierten Elternteil — das ist `styles.gradient` mit `flex: 1`).

---

## Supabase Secret

**Key-Name:** `ANTHROPIC_API_KEY`

Setzen via Supabase CLI:
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Oder im Supabase Dashboard: Settings → Edge Functions → Secrets → "New secret".

Bestehende Secrets bleiben unberührt: `GMAIL_USER`, `GMAIL_PASS`, `CRON_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`.

---

## Reihenfolge der Implementierung

```
1. ANTHROPIC_API_KEY Secret setzen (Supabase Dashboard)
2. supabase/functions/chat-assistant/config.json erstellen
3. supabase/functions/chat-assistant/index.ts implementieren
4. Edge Function deployen: supabase functions deploy chat-assistant
5. Manuell testen (curl oder Supabase Dashboard → Functions → Invoke)
6. src/services/chatService.ts erstellen
7. src/hooks/useChatbot.ts erstellen
8. src/components/chat/FloatingChatButton.tsx erstellen
9. src/components/chat/ChatModal.tsx erstellen
10. App.tsx anpassen (Import + Hook + JSX)
11. In Expo Web testen (Dark + Light Mode, Tastatur, Fehlerfall)
12. Auf Android/iOS testen (Tastatur-Avoidance, Safe-Area-Insets)
13. Commit + Push
```

Jeder Schritt ist unabhängig testbar bevor der nächste beginnt.

---

## Kosten-Schätzung

**Modell:** `claude-haiku-4-5`
**Preise (Stand Mai 2025):** $0.80 / 1M Input-Token, $4.00 / 1M Output-Token

**Annahmen pro Konversation:**
- System-Prompt: ~320 Token
- Durchschnittlicher Verlauf (5 Nachrichten hin+her): ~400 Token Input gesamt
- Antworten: 5 × ~80 Token = ~400 Output-Token

**Pro Konversation gesamt:**
- Input: 320 + 400 = ~720 Token → $0.000576
- Output: ~400 Token → $0.0016
- **Gesamt pro Konversation: ~$0.0022**

**Bei 100 Kunden, je 3 Konversationen/Monat (300 Konversationen):**
- ~300 × $0.0022 = **~$0.66/Monat**

**Bei 100 Kunden, je 10 Konversationen/Monat (1.000 Konversationen):**
- ~1.000 × $0.0022 = **~$2.20/Monat**

Die Kosten sind bei dieser Nutzungsintensität vernachlässigbar. Selbst bei
aggressiver Nutzung (100 Nachrichten/Tag pro Kunde) bleibt der Monatsbetrag unter $50.

---

## Considerations

**Assumptions:**
- Kunden sind immer eingeloggt wenn sie den Chat nutzen (JWT-Auth reicht)
- Kein Speichern des Chat-Verlaufs über Sessions hinaus erwünscht
- Anthropic API ist aus dem Supabase Edge Function Runtime (Deno) erreichbar (ist sie)

**Constraints (aus CLAUDE.md):**
- Kein `Alert.alert()` — Fehler werden inline in `ChatModal` als roter Text angezeigt
- Kunden-App bleibt im 430px-Container — ChatModal nutzt 100% Containerbreite
- `supabase.functions.invoke()` verwenden, kein manuelles `fetch()`
- Edge Functions die eigene Auth prüfen: da wir `verify_jwt: true` setzen UND manuell prüfen,
  ist die Funktion doppelt abgesichert

**Risks:**
- Haiku könnte bei unklaren Fragen halluzinieren: Das System-Prompt begrenzt explizit den
  Scope und weist auf Kundenservice hin
- Anthropic API Latenz: max_tokens: 512 hält Antworten kurz; Haiku ist typischerweise < 1.5 s
- Rate-Limits: Anthropic Free-Tier hat 5 RPM — für Produktion Bezahl-Plan sicherstellen

**Known Pitfalls:**
- `position: 'absolute'` auf dem FloatingButton muss im richtigen Elternelement sein.
  Das `appContent`-Fragment hat keinen eigenen Wrapper — der Button muss in denselben
  `<>...</>` wie BottomNav, damit er relativ zum Gradient-Container positioniert wird.
  Falls der Button unter der BottomNav verschwindet: `zIndex` erhöhen oder
  Render-Reihenfolge anpassen (Button nach BottomNav im JSX).
- Auf Web rendert `position: 'absolute'` relativ zum nächsten positionierten Vorfahren.
  Das `webInner`-View hat `overflow: 'hidden'` — der Button bleibt dadurch korrekt im
  430px-Container eingegrenzt (kein ungewolltes Überlaufen).
- Keine Supabase Realtime-Channels nötig — kein Risiko des StrictMode-Doppelmount-Crashs.

---

## Not Included (Future)

- Persistenz des Chat-Verlaufs in der Datenbank (neue Tabelle `chat_messages`)
- Push-Benachrichtigung wenn Admin antwortet (wäre dann kein Bot mehr)
- Streaming-Antworten (würde UX verbessern, erhöht aber Komplexität erheblich)
- Admin-Sicht auf häufig gestellte Fragen (Analytics)
- Mehrsprachigkeit (aktuell nur Deutsch)
- Attachment-Upload (Fotos von Fehlermeldungen etc.)

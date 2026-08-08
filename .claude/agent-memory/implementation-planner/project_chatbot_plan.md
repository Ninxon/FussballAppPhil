---
name: project-chatbot-plan
description: KI-Chatbot Feature geplant 2026-05-20 — Floating Button, Edge Function chat-assistant, Haiku-Modell, neue Dateien
metadata:
  type: project
---

Chatbot-Feature wurde vollständig geplant. Plan liegt unter `docs/plans/chatbot.md`.

**Why:** Kunden sollen einfache FAQ-Fragen zur App selbst beantworten können, ohne den Admin zu kontaktieren.

**How to apply:** Wenn der User die Implementierung startet, zuerst das Secret setzen, dann Edge Function, dann Client-Schicht, dann UI.

## Neue Dateien (geplant, noch nicht implementiert)
- `supabase/functions/chat-assistant/index.ts` — Anthropic Haiku API-Wrapper
- `supabase/functions/chat-assistant/config.json` — `{ "verify_jwt": true }`
- `src/services/chatService.ts` — `ChatService.send(messages[])`
- `src/hooks/useChatbot.ts` — State: messages, isOpen, loading, errorText
- `src/components/chat/FloatingChatButton.tsx` — absolut positioniert, bottom: 90, right: 20
- `src/components/chat/ChatModal.tsx` — React Native Modal, transparent, slide animation

## Geplante Änderungen
- `App.tsx`: `useChatbot` Hook + FloatingChatButton + ChatModal nach BottomNav einbauen
- Supabase Secret `ANTHROPIC_API_KEY` setzen

## Architektur-Entscheidungen
- Kein Streaming — gebufferte Antwort (Einfachheit)
- Kein DB-Speichern — Chat ist ephemer (in-memory Hook-State)
- max 10 Nachrichten im Verlauf (Kosten-Deckel)
- `verify_jwt: true` in config.json (Kunden müssen eingeloggt sein)

## Kosten
- ~$0.66–$2.20/Monat bei 100 Kunden (Haiku, 3–10 Konversationen/Monat)

See also: [[project_pkxapp_state]]

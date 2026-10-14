# NHAA 14566 · AI Real-Time Stress & Trauma Assessment Module (SIH PS 26093)

## Original problem statement
Ministry of Social Justice and Empowerment · Smart India Hackathon 2026, PS 26093.
Design an AI-enabled Real-Time Stress and Trauma Assessment Module that assesses the
psychological stress, trauma, fear, anxiety and vulnerability of SC/ST victims and
complainants at first contact via NHAA 14566, Integrated Portal, chatbot, IVRS or mobile
app — computing a Stress Vulnerability Index (SVI) and triaging into Low / Moderate /
High / Critical risk categories.

## Personas
- **Victim / complainant** — distressed, may have low digital literacy; light-mode calm interface
- **NHAA officer / counselor / admin** — reviews AI-prioritised cases on dark command dashboard
- **MoSJE official (analytics)** — deferred to next phase

## What's been implemented (2026-02-09)
- FastAPI backend with MongoDB — JWT officer auth (bcrypt), anonymous victim sessions,
  seeded 3 demo officers, seeded 5 demo cases across all channels
- Chatbot 5-stage conversational flow with quick-reply chips
- Voice mock STT + acoustic feature payload (pitch variance, pause ratio, speech rate, energy, jitter)
- **Real Claude Sonnet 4.5** integration via emergentintegrations for trauma-aware
  narrative analysis (stress/fear/anxiety/trauma 0–100 + factors + recommendations),
  falls back to rule-based scoring if LLM fails
- SVI weighted scoring + risk categorisation (thresholds configurable in code)
- Officer dashboard with 4 stat cards, priority-case red banner, live table
- Case management with search + risk + status filters
- Case detail with SVI hero, sub-score bars, voice + text signal cards, Explainable-AI
  factor list, narrative, recommended next steps, audit trail, escalate/close/review actions
  (each writes an audit-trail entry)
- Victim landing (tri-modal cards, emergency banner, govt strip, floating Call 14566),
  emergency screen with helpline numbers, assessment result page with staged animation
- Design tokens: Outfit / Inter / JetBrains Mono, navy + saffron brand, risk colour scale
- Test credentials: OFF-2001 / OFF-2002 / OFF-2003, password `demo123`
## What's been implemented (2026-06 · fork 2)
- **Real speech-to-text**: `POST /api/voice/transcribe` (multipart: session_id, duration, language, audio)
  → OpenAI `whisper-1` via emergentintegrations + Emergent LLM key. Rejects empty/silent audio (422),
  >25 MB (413). Derives speech_rate/pause_ratio from transcript + duration.
- Victim voice page uses browser MediaRecorder (webm/opus) → uploads on stop → editable transcript.
  Mic-permission and transcription errors shown inline (`voice-error-message`).
- `/api/voice/mock-transcribe` retained for demo fallback.
ice/mock-transcribe` retained for demo fallback.
- **Critical case alerts**: `GET /api/cases?since=` filter; `useCriticalAlerts` hook (5s poll) in OfficerShell fires
  red sonner toast with "Open case" action on every officer page; dashboard auto-refreshes stats/table and
  flashes new rows red for 15s. Two-tone Web Audio chime plays with each alert.
- Sidebar "Alert chime" toggle (`alert-mute-toggle`) persists to `localStorage.nhaa_alert_muted`; toasts still show when muted. and is passed to Whisper (`language=hi` verified with Hindi TTS audio).
 **Analytics page** `/officer/analytics` (sidebar nav): `GET /api/analytics/summary?days=` → KPIs (total, avg SVI,
  critical share, resolved), stacked area volume-by-day (7/14/30d), risk-mix donut, channel bar chart
  (cases/critical/avg SVI), incident-category bars. Recharts. Seeded cases spread across past 12 days for demo trend.


## Backlog (P0 → P2)

- P1 analytics: export CSV/PDF, district/state filters
- P1 real acoustic features (pitch/energy/jitter from audio via librosa) — currently heuristic
- P1 multi-language UI (Hindi first) — pass `language=hi` to Whisper from the language selector
- P2 IVRS webhook stub + chatbot webhook stub for Integrated Portal
- P2 role-based officer scoping (agent vs counselor vs admin data visibility)
- P2 Deployment (Docker + prod Mongo Atlas + prod secrets)

# NHAA 14566 SVI

## Prerequisites

- Python 3.11 or newer
- Node.js 20 or newer and npm
- Docker Desktop (for the local MongoDB service), or another MongoDB instance

The frontend folder is named `frontend` in the source checkout; keep that spelling when running the commands below.

## Configure and start MongoDB

From the `app` directory:

```powershell
docker compose up -d mongodb
```

MongoDB is exposed only on localhost at port 27017. Its data is stored in the `mongodb_data` Docker volume.

## Start the backend

In another PowerShell window, from `app`:

```powershell
cd backend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `backend\.env` and set a unique `JWT_SECRET`. If you already have a configured `.env`, keep it and do not overwrite it. Then install dependencies and start the API:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

If the `py` launcher is unavailable, create the environment with `python -m venv .venv` using Python 3.11 or newer. The API health check is at <http://localhost:8000/api/health>; interactive API docs are at <http://localhost:8000/docs>.

The victim-facing interface is available in English, Hindi, Bengali, Marathi, Tamil, and Telugu; the language selector applies immediately and persists in the browser. Chat prompts and quick replies are localized, while the language chosen also selects the matching voice-recognition locale. The voice page uses the browser's native Web Speech API; the browser must support `SpeechRecognition` or `webkitSpeechRecognition` and have microphone permission. Recognition availability, language support, and whether audio is processed by a browser vendor's service depend on the browser. This implementation does not upload a recording to the app backend. If speech recognition is unavailable, use the chat option instead; the app does not substitute a fake transcript.

Assessment runs with its existing rules and may optionally use the Emergent integration described below. Victim chat uses an OpenAI-compatible Chat Completions model and does not fall back to canned replies. The default provider is local Ollama, keeping chat content on this machine:

```dotenv
CHAT_LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.2:3b
CHAT_AI_TIMEOUT_SECONDS=25
CHAT_MESSAGE_MAX_LENGTH=2000
CHAT_HISTORY_LIMIT=24
CHAT_RATE_LIMIT_PER_MINUTE=8
```

Install Ollama from <https://ollama.com/download>, start its local service, then download the configured model by running `ollama pull llama3.2:3b`. If Ollama or the model is unavailable, the chat shows an error and keeps the original victim message for retry; it never substitutes a canned response. Immediate-danger phrases recognized by the backend receive a safety-oriented response without calling the model. The selected language (English, Hindi, Bengali, Marathi, Tamil, or Telugu) is included in the model instructions.

For each normal response, the backend sends the system safety instruction, recent conversation history, and saved AI summary / extracted facts / unknown fields / safety flags. Message content can include personal information voluntarily typed by the victim. The default Ollama integration is restricted to HTTP loopback addresses and sends this context only to the local service. Application message history remains stored in MongoDB's `sessions` collection.

To use OpenAI or another hosted OpenAI-compatible provider instead, set `CHAT_LLM_PROVIDER=openai` and configure `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` in `backend\.env`. Keep provider keys on the backend; never use a `VITE_` variable for them. Hosted providers receive chat content, so review their data-processing and retention settings before use with real victims. This project does not assert that a provider satisfies any particular legal or privacy standard.

AI-supported summaries, facts, and safety indicators are stored separately from the append-only original messages. Extracted facts are retained only when the cited source is a victim message and the evidence quote appears in it; corrected values supersede the current extracted value while the prior extraction is preserved in its history. Unknown fields remain explicit. Officers assigned by stable officer ID and admins can view the original transcript, summary, source quotes, and review indicators from the case detail screen. Legacy cases that contain only an assigned display name must be reassigned by an authorized workflow before a non-admin can review the conversation; display names alone are not treated as authorization. AI summaries and flags are not verified findings.

The existing signed victim-session token is required for victim chat and session history; browser-supplied session IDs alone do not authorize access. The officer conversation endpoint requires an authenticated officer and verifies assignment (or admin role) server-side. This is stricter than the legacy general case-detail access rules. Do not treat the demonstration authentication setup as production-ready.

To enable chat, install and start Ollama and pull the model above, then start FastAPI using the existing backend instructions. Start the frontend as usual. The victim can select **End chat & view assessment** at any time to pass their messages to the existing assessment flow. To verify that replies are input-dependent without paid API calls, run the backend tests, which mock the model provider; for a live check, send distinct messages in one victim session and verify the answers use their content and earlier turns.

The app runs with rule-based assessment without an LLM integration. Optional Claude enrichment still needs the Emergent-provided `emergentintegrations` package and a valid `EMERGENT_LLM_KEY`. That package is not available from the public Python package index, so install it only from an Emergent environment/source that provides it.

## Victim location sharing

After an assessment creates a case, the victim may choose to share a one-time GPS location or enter an address manually. Browser location permission is requested only when the victim clicks **Share My Current Location**; coordinates are not sent to the backend until the victim reviews the details and confirms consent. The application does not continuously track victims or load an external map.

Victim location requests require the signed victim-session token and are bound server-side to the case created from that session. Officer retrieval requires a valid officer token. Locations on assigned cases are visible only to the assigned officer or an admin; unassigned cases follow the existing officer-role access policy (officer, counselor, or admin), since the app has no separate per-case permission model for unassigned records. Withdrawing sharing immediately hides precise details from the officer view. A deletion request also withdraws sharing, but records remain stored until handled according to applicable retention and legal requirements.

## Start the frontend

In a third PowerShell window, from `app`:

```powershell
cd frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm run dev
```

Open <http://localhost:5173>. `VITE_BACKEND_URL` defaults to `http://localhost:8000`; set it in `forntend\.env.local` if the API is hosted elsewhere. The backend's `CORS_ORIGINS` must include the frontend origin.

## Demo officer accounts

Sign in at `/officer/login` with any of the seeded accounts (`OFF-2001`, `OFF-2002`, or `OFF-2003`) and the demo password documented in `memory/test_credentials.md`. These credentials are for local demonstration only.

## Production note

Do not use the demo credentials, development MongoDB setup, or a checked-in `.env` in production. Configure strong secrets, authenticated MongoDB, restricted CORS, and a production deployment before handling real users or sensitive case information.









Step 1 — Open your project in VS Code
Open VS Code and open your project folder:
C:\Users\shyam\OneDrive\Desktop\SVI Triage\app
Start Docker Desktop too, if it isn't already running.

Step 2 — Start MongoDB
Open a terminal in VS Code using Terminal → New Terminal.
Copy and paste:
cd "C:\Users\shyam\OneDrive\Desktop\SVI Triage\app"
docker compose up -d mongodb


This starts your database in the background. You don't need to keep this terminal busy; you can use it for other commands afterward.
Step 3 — Start the backend
Open another new terminal in VS Code.
Copy and paste these commands one at a time:
cd "C:\Users\shyam\OneDrive\Desktop\SVI Triage\app\backend"


Then:
.\.venv\Scripts\Activate.ps1


Then:
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000


Wait until you see Application startup complete. Keep this terminal open.
Step 4 — Start the frontend
Open a third terminal in VS Code.
Run:
cd "C:\Users\shyam\OneDrive\Desktop\SVI Triage\app\frontend"


Then:
npm run dev


Wait for Vite to show a local address, usually http://localhost:5173/.
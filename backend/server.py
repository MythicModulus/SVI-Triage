"""NHAA 14566 - AI Real-Time Stress & Trauma Assessment Backend."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import httpx
import os, logging, uuid, json, bcrypt, jwt, asyncio, re
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = os.environ["JWT_ALG"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
CHAT_LLM_PROVIDER = os.environ.get("CHAT_LLM_PROVIDER", "ollama").strip().lower()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:3b")
CHAT_AI_TIMEOUT_SECONDS = float(os.environ.get("CHAT_AI_TIMEOUT_SECONDS", "25"))
CHAT_MESSAGE_MAX_LENGTH = int(os.environ.get("CHAT_MESSAGE_MAX_LENGTH", "2000"))
CHAT_HISTORY_LIMIT = int(os.environ.get("CHAT_HISTORY_LIMIT", "24"))
CHAT_RATE_LIMIT_PER_MINUTE = int(os.environ.get("CHAT_RATE_LIMIT_PER_MINUTE", "8"))

app = FastAPI(title="NHAA 14566 SVI Backend")
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("nhaa")

# ---------- Models ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

class OfficerLogin(BaseModel):
    officer_id: str
    password: str

class OfficerOut(BaseModel):
    id: str
    officer_id: str
    name: str
    role: str

class TokenOut(BaseModel):
    token: str
    officer: OfficerOut

class VictimSessionOut(BaseModel):
    session_token: str
    session_id: str

class ChatMessageIn(BaseModel):
    client_message_id: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    message: str = Field(min_length=1, max_length=CHAT_MESSAGE_MAX_LENGTH)
    language: Literal["en", "hi", "bn", "mr", "ta", "te"] = "en"

    @field_validator("message")
    @classmethod
    def message_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Message cannot be blank")
        return value

class ChatMessageOut(BaseModel):
    reply: str
    client_message_id: str
    quick_replies: List[str] = Field(default_factory=list)
    done: bool = False
    immediate_safety_concern: bool = False

class ChatExtractedFact(BaseModel):
    field: Literal[
        "incident_description", "incident_datetime", "location",
        "threats_or_safety_concerns", "relationship",
    ]
    value: str = Field(min_length=1, max_length=1000)
    evidence: str = Field(min_length=1, max_length=500)
    source_message_id: str = Field(min_length=1, max_length=64)

class ChatExtractedConcern(BaseModel):
    category: Literal["immediate_danger", "threat", "coercion", "other"]
    concern: str = Field(min_length=1, max_length=500)
    evidence: str = Field(min_length=1, max_length=500)
    source_message_id: str = Field(min_length=1, max_length=64)

class ChatAIOutput(BaseModel):
    reply: str = Field(min_length=1, max_length=2000)
    summary: str = Field(default="", max_length=3000)
    explicit_facts: List[ChatExtractedFact] = Field(default_factory=list, max_length=30)
    unknown_fields: List[Literal[
        "incident_description", "incident_datetime", "location",
        "threats_or_safety_concerns", "relationship",
    ]] = Field(default_factory=list, max_length=5)
    potential_safety_concerns: List[ChatExtractedConcern] = Field(default_factory=list, max_length=10)
    human_review_recommended: bool = False

class VoiceMockIn(BaseModel):
    session_id: str

class VoiceMockOut(BaseModel):
    transcript: str
    speech_features: dict

class AssessmentIn(BaseModel):
    session_id: str = Field(min_length=1, max_length=64)
    channel: Literal["voice", "chat", "portal", "ivrs", "mobile"] = "chat"
    narrative: str = Field(max_length=10000)
    speech_features: Optional[dict] = None
    incident_category: Optional[str] = None

class AssessmentSub(BaseModel):
    stress: int
    fear: int
    anxiety: int
    trauma: int

class AssessmentOut(BaseModel):
    case_id: str
    case_ref: str
    svi_score: int
    risk_category: str
    sub_scores: AssessmentSub
    voice_signals: dict
    text_signals: dict
    factors: List[str]
    recommended_actions: List[str]
    narrative: str
    created_at: str

class CaseStatusUpdate(BaseModel):
    status: str
    note: Optional[str] = None

class VictimLocationIn(BaseModel):
    source: Literal["gps", "manual"]
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    address: Optional[str] = Field(default=None, max_length=300)
    instructions: Optional[str] = Field(default=None, max_length=1000)
    accuracy_m: Optional[float] = Field(default=None, ge=0, le=100000)
    consent: bool = False

# ---------- Helpers ----------
def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def make_token(sub: str, role: str, ttl_hours: int = 24) -> str:
    payload = {"sub": sub, "role": role, "exp": datetime.now(timezone.utc) + timedelta(hours=ttl_hours)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def current_officer(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid token")
    if payload.get("role") not in {"officer", "admin", "counselor"}:
        raise HTTPException(403, "Not authorized")
    officer = await db.officers.find_one({"officer_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not officer:
        raise HTTPException(401, "Officer not found")
    return officer

async def current_victim(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid token")
    if payload.get("role") != "victim" or not payload.get("sub"):
        raise HTTPException(403, "Not authorized")
    session = await db.sessions.find_one({"id": payload["sub"]}, {"_id": 0, "id": 1})
    if not session:
        raise HTTPException(401, "Victim session not found")
    return payload["sub"]

def officer_can_access_case(case: dict, officer: dict) -> bool:
    if officer.get("role") == "admin":
        return True
    assigned_officer_id = case.get("assigned_officer_id")
    if assigned_officer_id is not None:
        return assigned_officer_id == officer.get("officer_id")
    assigned_officer = case.get("assigned_officer")
    return not assigned_officer or assigned_officer == officer.get("name")

# ---------- Seed demo officers ----------
DEMO_OFFICERS = [
    {"officer_id": "OFF-2001", "password": "demo123", "name": "Nodal Officer Priya Sharma", "role": "officer"},
    {"officer_id": "OFF-2002", "password": "demo123", "name": "District Collector R. Iyer", "role": "admin"},
    {"officer_id": "OFF-2003", "password": "demo123", "name": "AI Auditor Anjali Rao", "role": "counselor"},
]

async def seed_officers():
    for o in DEMO_OFFICERS:
        exists = await db.officers.find_one({"officer_id": o["officer_id"]})
        if not exists:
            await db.officers.insert_one({
                "id": str(uuid.uuid4()),
                "officer_id": o["officer_id"],
                "password_hash": hash_pw(o["password"]),
                "name": o["name"],
                "role": o["role"],
                "created_at": now_iso(),
            })
    # Seed a few demo cases if empty
    count = await db.cases.count_documents({})
    if count == 0:
        demo = [
            ("Voice", "threat", 82, 91, 76, 78, "critical", "Repeated threats after filing complaint. Fear for family safety."),
            ("Chat", "boycott", 54, 61, 58, 49, "high", "Neighborhood boycott and blocked access to community well."),
            ("Portal", "assault", 71, 68, 66, 72, "high", "Physical assault by upper-caste group during festival."),
            ("Mobile", "displacement", 34, 41, 38, 30, "moderate", "Forced to leave village. Currently in relative's home."),
            ("IVRS", "harassment", 22, 26, 19, 18, "low", "Workplace verbal harassment; seeking guidance."),
        ]
        for ch, cat, s, f, a, t, risk, narr in demo:
            svi = int((s + f + a + t) / 4)
            cid = str(uuid.uuid4())
            ref = f"NHAA-2026-{str(uuid.uuid4().int)[:5]}"
            await db.cases.insert_one({
                "id": cid, "case_ref": ref, "channel": ch, "incident_category": cat,
                "svi_score": svi, "risk_category": risk,
                "sub_scores": {"stress": s, "fear": f, "anxiety": a, "trauma": t},
                "voice_signals": {"pitch_variance": 0.42, "pause_ratio": 0.31, "speech_rate": 148, "energy": 0.58, "jitter": 0.07},
                "text_signals": {"fear_keywords": 6, "threat_keywords": 4, "urgency": 0.7, "distress_score": 0.82},
                "factors": ["Repeated threat descriptions", "Elevated fear-related language",
                            "Significant pauses during account", "Reported lack of immediate support"],
                "recommended_actions": ["Priority human review", "Safety assessment", "Consider psychological support"],
                "narrative": narr,
                "status": "awaiting_review",
                "assigned_officer": None,
                "created_at": now_iso(),
                "audit": [{"ts": now_iso(), "actor": "system", "event": "Case received", "note": "AI assessment generated"}],
            })

# ---------- LLM Assessment ----------
FEAR_WORDS = ["afraid", "scared", "fear", "terrified", "threat", "kill", "hurt", "danger", "unsafe", "panic", "beat", "attack"]
DISTRESS_WORDS = ["can't sleep", "crying", "helpless", "hopeless", "alone", "shaking", "trembling", "nightmare", "flashback", "can't eat"]
URGENCY_WORDS = ["now", "immediately", "urgent", "tonight", "today", "right now", "please help"]

def rule_based_scores(text: str, speech_features: Optional[dict]) -> dict:
    t = (text or "").lower()
    fear_hits = sum(1 for w in FEAR_WORDS if w in t)
    distress_hits = sum(1 for w in DISTRESS_WORDS if w in t)
    urgency_hits = sum(1 for w in URGENCY_WORDS if w in t)
    length_factor = min(len(t) / 400, 1.0)

    base_fear = min(30 + fear_hits * 12 + urgency_hits * 8, 100)
    base_anxiety = min(28 + distress_hits * 11 + fear_hits * 5, 100)
    base_stress = min(30 + (fear_hits + distress_hits) * 8 + int(length_factor * 15), 100)
    base_trauma = min(25 + distress_hits * 13 + fear_hits * 4, 100)

    if speech_features:
        pv = speech_features.get("pitch_variance", 0)
        pr = speech_features.get("pause_ratio", 0)
        base_stress = min(int(base_stress + pv * 30 + pr * 25), 100)
        base_fear = min(int(base_fear + pv * 20), 100)
        base_anxiety = min(int(base_anxiety + pr * 25), 100)

    return {
        "stress": int(base_stress), "fear": int(base_fear),
        "anxiety": int(base_anxiety), "trauma": int(base_trauma),
        "signals": {
            "fear_keywords": fear_hits, "threat_keywords": fear_hits,
            "urgency": round(urgency_hits / max(len(t.split()) / 20, 1), 2),
            "distress_score": round(distress_hits / 6, 2),
        }
    }

def svi_and_risk(sub: dict) -> tuple[int, str]:
    svi = int(0.28 * sub["stress"] + 0.30 * sub["fear"] + 0.22 * sub["anxiety"] + 0.20 * sub["trauma"])
    if svi >= 76: cat = "critical"
    elif svi >= 51: cat = "high"
    elif svi >= 26: cat = "moderate"
    else: cat = "low"
    return svi, cat

async def llm_analyze(narrative: str) -> dict:
    """Optional Claude-based enrichment. Falls back to rule-based silently on failure."""
    if not EMERGENT_LLM_KEY or not narrative.strip():
        return {}
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        sys_msg = (
            "You are a trauma-informed clinical screening assistant for a Government of India helpline (NHAA 14566). "
            "You NEVER diagnose. Return STRICT JSON only with keys: stress, fear, anxiety, trauma (integers 0-100), "
            "factors (list of 3-5 short human-readable strings explaining what in the narrative influenced these), "
            "recommended_actions (list of 2-4 short next-step suggestions). No prose outside JSON."
        )
        chat = (LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"assess-{uuid.uuid4()}", system_message=sys_msg)
                .with_model("anthropic", "claude-sonnet-4-5-20250929"))
        prompt = f"Victim narrative:\n\"\"\"{narrative}\"\"\"\nReturn JSON only."
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return {}
        data = json.loads(m.group(0))
        for k in ("stress", "fear", "anxiety", "trauma"):
            if k in data:
                data[k] = max(0, min(100, int(data[k])))
        return data
    except Exception as e:
        logger.warning(f"LLM analyze failed, using rule-based: {e}")
        return {}

# ---------- Routes ----------
@api.get("/")
async def root():
    return {"service": "NHAA 14566 SVI", "status": "ok"}

@api.get("/health")
async def health():
    return {"ok": True, "ts": now_iso()}

# Victim anonymous session
@api.post("/auth/victim-session", response_model=VictimSessionOut)
async def victim_session():
    sid = str(uuid.uuid4())
    token = jwt.encode({"sub": sid, "role": "victim",
                        "exp": datetime.now(timezone.utc) + timedelta(hours=6)},
                       JWT_SECRET, algorithm=JWT_ALG)
    await db.sessions.insert_one({"id": sid, "created_at": now_iso(), "messages": []})
    return {"session_token": token, "session_id": sid}

# Officer login
@api.post("/auth/login", response_model=TokenOut)
async def officer_login(body: OfficerLogin):
    officer = await db.officers.find_one({"officer_id": body.officer_id})
    if not officer or not verify_pw(body.password, officer["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    token = make_token(officer["officer_id"], officer["role"])
    return {"token": token,
            "officer": {"id": officer["id"], "officer_id": officer["officer_id"],
                        "name": officer["name"], "role": officer["role"]}}

@api.get("/auth/demo-officers")
async def demo_officers():
    return [{"officer_id": o["officer_id"], "password": o["password"], "name": o["name"], "role": o["role"]}
            for o in DEMO_OFFICERS]

CHAT_SYSTEM_INSTRUCTION = """You are the NHAA 14566 victim-support chat assistant. You are an AI, not a human officer, therapist, lawyer, or emergency service.

Respond to the meaning of the latest message using the supplied conversation history. Be calm, respectful, trauma-informed, and use short, accessible language. Ask at most one optional question, only when it is useful; do not ask for details the victim already supplied. Acknowledge corrections and use the corrected detail while leaving earlier messages unchanged. The victim may decline to answer or stop at any time. Never blame, judge, challenge credibility, infer guilt, invent incident facts, promise confidentiality, or give definitive legal or psychological conclusions. Offer the existing human-support option when appropriate. Never say help has been contacted unless a separate verified action says so.

If the latest message or prior context indicates possible immediate danger, do not continue routine fact gathering. Prioritize immediate safety and suggest the victim use the app's existing 14566 helpline or their local emergency service if safe. Do not claim the app has contacted anyone.

Return only a JSON object with these keys:
{"reply":"...","summary":"brief AI-generated summary, or empty string","explicit_facts":[{"field":"incident_description|incident_datetime|location|threats_or_safety_concerns|relationship","value":"...","evidence":"an exact quote copied from a victim message","source_message_id":"the id of that victim message"}],"unknown_fields":["..."],"potential_safety_concerns":[{"category":"immediate_danger|threat|coercion|other","concern":"...","evidence":"exact quote copied from a victim message","source_message_id":"the id of that victim message"}],"human_review_recommended":true}

For any fact or concern, copy the exact victim message id shown with the source message into source_message_id. Only include facts and concerns explicitly supported by an exact victim quote. Do not include assistant text as evidence. Use empty lists when unsupported. Unknown fields are not facts. A summary is your interpretation and must remain clearly labelled as AI-generated by the application."""

FACT_FIELDS = (
    "incident_description", "incident_datetime", "location",
    "threats_or_safety_concerns", "relationship",
)
IMMEDIATE_DANGER_PATTERN = re.compile(
    r"\b(?:right now|at this moment|in immediate danger|not safe right now|"
    r"they(?:'re| are) here|he(?:'s| is) here|she(?:'s| is) here|"
    r"outside (?:my|the) (?:home|house)|trying to (?:break in|get inside)|"
    r"following me|going to (?:kill|hurt|attack) me (?:now|tonight))\b",
    re.IGNORECASE,
)
IMMEDIATE_DANGER_REPLY = (
    "Your immediate safety matters most. If you can, move to a safer place without "
    "putting yourself at greater risk, and contact local emergency services or call "
    "the app's 14566 helpline when it is safe. The app has not contacted anyone. "
    "You do not need to share more here right now."
)


async def call_openai_chat_model(messages: list[dict]) -> ChatAIOutput:
    if not OPENAI_API_KEY:
        logger.warning("Victim chat AI provider is not configured")
        raise HTTPException(503, "The automated response service is temporarily unavailable. Please use the 14566 helpline or try again later.")

    if not OPENAI_BASE_URL.startswith("https://") and not re.match(
        r"^http://(?:localhost|127\.0\.0\.1)(?::\d+)?(?:/|$)", OPENAI_BASE_URL
    ):
        logger.error("Victim chat AI provider must use HTTPS outside localhost")
        raise HTTPException(503, "The automated response service is temporarily unavailable. Please try again later.")

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(CHAT_AI_TIMEOUT_SECONDS)) as client:
            response = await client.post(
                f"{OPENAI_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": OPENAI_MODEL,
                    "messages": messages,
                    "temperature": 0.3,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        return ChatAIOutput.model_validate_json(content)
    except HTTPException:
        raise
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        logger.warning("Victim chat AI provider request failed (openai)")
        raise HTTPException(
            503,
            "The automated response service is temporarily unavailable. Please use the 14566 helpline or try again later.",
        ) from None


async def call_ollama_chat_model(messages: list[dict]) -> ChatAIOutput:
    parsed_url = httpx.URL(OLLAMA_BASE_URL)
    if parsed_url.scheme != "http" or parsed_url.host not in {"localhost", "127.0.0.1", "::1"}:
        logger.error("Local Ollama provider must use an HTTP loopback URL")
        raise HTTPException(503, "The local chat model must be configured to use Ollama on this machine.")

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(CHAT_AI_TIMEOUT_SECONDS)) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/chat/completions",
                headers={"Content-Type": "application/json"},
                json={
                    "model": OLLAMA_MODEL,
                    "messages": messages,
                    "temperature": 0.3,
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": "nhaa_chat_response",
                            "strict": True,
                            "schema": ChatAIOutput.model_json_schema(),
                        },
                    },
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        return ChatAIOutput.model_validate_json(content)
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
        logger.warning("Local Ollama chat request failed")
        raise HTTPException(
            503,
            f"Local Ollama is unavailable or model '{OLLAMA_MODEL}' is not installed. Start Ollama and run `ollama pull {OLLAMA_MODEL}`.",
        ) from None


async def call_chat_model(messages: list[dict]) -> ChatAIOutput:
    if CHAT_LLM_PROVIDER == "ollama":
        return await call_ollama_chat_model(messages)
    if CHAT_LLM_PROVIDER == "openai":
        return await call_openai_chat_model(messages)
    logger.error("Unsupported victim chat model provider: %s", CHAT_LLM_PROVIDER)
    raise HTTPException(503, "The chat model provider is not configured correctly.")


CHAT_LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi",
    "bn": "Bengali",
    "mr": "Marathi",
    "ta": "Tamil",
    "te": "Telugu",
}


def model_context(session: dict, language: str = "en") -> list[dict]:
    analysis = session.get("conversation_analysis") or {}
    context = {
        "ai_generated_summary": analysis.get("ai_summary"),
        "current_explicit_facts": analysis.get("explicit_facts", {}),
        "unknown_fields": analysis.get("unknown_fields", list(FACT_FIELDS)),
        "potential_safety_concerns": analysis.get("potential_safety_concerns", []),
    }
    history = [
        {
            "role": message.get("role"),
            "content": (
                f"[Victim message id: {message.get('id')}]\n{message.get('text', '')}"
                if message.get("role") == "user" and message.get("id")
                else message.get("text", "")
            ),
        }
        for message in session.get("messages", [])[-max(1, CHAT_HISTORY_LIMIT):]
        if message.get("role") in {"user", "assistant"} and isinstance(message.get("text"), str)
    ]
    return [
        {
            "role": "system",
            "content": (
                CHAT_SYSTEM_INSTRUCTION
                + f"\nRespond to the victim in {CHAT_LANGUAGE_NAMES.get(language, 'English')}. "
                + "Keep exact source evidence quotes and message IDs unchanged in the JSON."
            ),
        },
        {"role": "system", "content": "Existing session context (AI summary is not a verified fact): " + json.dumps(context, ensure_ascii=False)},
        *history,
    ]


def merge_chat_analysis(
    session: dict,
    generated: ChatAIOutput,
    messages: list[dict],
    immediate_match: Optional[re.Match] = None,
) -> dict:
    previous = session.get("conversation_analysis") or {}
    explicit_facts = dict(previous.get("explicit_facts") or {})
    fact_history = list(previous.get("fact_history") or [])
    message_by_id = {
        item.get("id"): item for item in messages
        if item.get("role") == "user" and item.get("id")
    }
    updated_at = now_iso()

    for item in generated.explicit_facts:
        source = message_by_id.get(item.source_message_id)
        if not source or item.evidence.casefold() not in source.get("text", "").casefold():
            continue
        current = explicit_facts.get(item.field)
        fact = {
            "value": item.value,
            "evidence": item.evidence,
            "source_message_id": item.source_message_id,
            "provenance": "victim_message_quote",
            "updated_at": updated_at,
        }
        if current and current.get("value") != item.value:
            fact_history.append({**current, "field": item.field, "superseded_at": updated_at})
        explicit_facts[item.field] = fact

    concerns = list(previous.get("potential_safety_concerns") or [])
    for item in generated.potential_safety_concerns:
        source = message_by_id.get(item.source_message_id)
        if not source or item.evidence.casefold() not in source.get("text", "").casefold():
            continue
        concern = {
            "category": item.category,
            "concern": item.concern,
            "evidence": item.evidence,
            "source_message_id": item.source_message_id,
            "provenance": "victim_message_quote",
        }
        if concern not in concerns:
            concerns.append(concern)

    if immediate_match:
        current_message = next(
            (item for item in reversed(messages) if item.get("role") == "user"),
            None,
        )
        if current_message:
            quote = current_message.get("text", "")[
                immediate_match.start():immediate_match.end()
            ]
            concerns.append({
                "category": "immediate_danger",
                "concern": "A phrase indicating possible immediate danger was detected; human review is recommended.",
                "evidence": quote,
                "source_message_id": current_message.get("id"),
                "provenance": "deterministic_phrase_match",
            })

    ai_summary = generated.summary.strip() or (previous.get("ai_summary") or {}).get("text", "")
    return {
        "ai_summary": {"text": ai_summary, "updated_at": updated_at} if ai_summary else None,
        "explicit_facts": explicit_facts,
        "fact_history": fact_history,
        "unknown_fields": [field for field in FACT_FIELDS if field not in explicit_facts],
        "potential_safety_concerns": concerns,
        "human_review_recommended": bool(
            previous.get("human_review_recommended")
            or generated.human_review_recommended
            or immediate_match
        ),
        "updated_at": updated_at,
    }


async def enforce_chat_rate_limit(session_id: str) -> None:
    now = datetime.now(timezone.utc)
    window = int(now.timestamp() // 60)
    key = f"{session_id}:{window}"
    await db.chat_rate_limits.update_one(
        {"_id": key},
        {"$inc": {"count": 1},
         "$setOnInsert": {"expires_at": now + timedelta(minutes=3)}},
        upsert=True,
    )
    counter = await db.chat_rate_limits.find_one({"_id": key}, {"_id": 0, "count": 1})
    if counter and counter.get("count", 0) > max(1, CHAT_RATE_LIMIT_PER_MINUTE):
        raise HTTPException(
            429,
            "This chat is receiving messages too quickly. Please wait a moment before trying again.",
            headers={"Retry-After": "60"},
        )


def cached_chat_response(session: dict, client_message_id: str) -> Optional[dict]:
    return next(
        (
            message for message in session.get("messages", [])
            if message.get("role") == "assistant"
            and message.get("client_message_id") == client_message_id
        ),
        None,
    )


def chat_response(message: dict) -> dict:
    return {
        "reply": message["text"],
        "client_message_id": message["client_message_id"],
        "quick_replies": [],
        "done": False,
        "immediate_safety_concern": bool(message.get("immediate_safety_concern")),
    }


@api.post("/chat/message", response_model=ChatMessageOut)
async def chat_message(body: ChatMessageIn, session_id: str = Depends(current_victim)):
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Victim session not found")

    cached = cached_chat_response(session, body.client_message_id)
    if cached:
        original = next(
            (message for message in session.get("messages", [])
             if message.get("role") == "user"
             and message.get("client_message_id") == body.client_message_id),
            None,
        )
        if original and original.get("text") != body.message:
            raise HTTPException(409, "This message was already submitted with different content")
        return chat_response(cached)

    original = next(
        (message for message in session.get("messages", [])
         if message.get("role") == "user"
         and message.get("client_message_id") == body.client_message_id),
        None,
    )
    if original:
        if original.get("text") != body.message:
            raise HTTPException(409, "This message was already submitted with different content")
    else:
        user_message = {
            "id": body.client_message_id,
            "client_message_id": body.client_message_id,
            "role": "user",
            "text": body.message,
            "ts": now_iso(),
        }
        result = await db.sessions.update_one(
            {"id": session_id, "messages.client_message_id": {"$ne": body.client_message_id}},
            {"$push": {"messages": user_message}, "$set": {"updated_at": now_iso()}},
        )
        if not result.matched_count:
            session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
            cached = cached_chat_response(session or {}, body.client_message_id)
            if cached:
                return chat_response(cached)
            original = next(
                (message for message in session.get("messages", [])
                 if message.get("role") == "user"
                 and message.get("client_message_id") == body.client_message_id),
                None,
            )
            if not original or original.get("text") != body.message:
                raise HTTPException(409, "This message could not be safely retried")
            raise HTTPException(409, "This message is already being processed. Retry shortly.")

    await enforce_chat_rate_limit(session_id)
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Victim session not found")
    messages = session.get("messages", [])
    latest_user = next(
        (message for message in reversed(messages)
         if message.get("role") == "user"
         and message.get("client_message_id") == body.client_message_id),
        None,
    )
    if not latest_user:
        raise HTTPException(409, "This message could not be safely retried")

    immediate_match = IMMEDIATE_DANGER_PATTERN.search(body.message)
    if immediate_match:
        generated = ChatAIOutput(
            reply=IMMEDIATE_DANGER_REPLY,
            summary=((session.get("conversation_analysis") or {}).get("ai_summary") or {}).get("text", ""),
            human_review_recommended=True,
        )
    else:
        try:
            generated = await call_chat_model(model_context(session, body.language))
        except HTTPException:
            raise
        except Exception:
            logger.error("Victim chat response generation failed")
            raise HTTPException(
                503,
                "The automated response service is temporarily unavailable. Please use the 14566 helpline or try again later.",
            ) from None

    analysis = merge_chat_analysis(session, generated, messages, immediate_match)
    assistant_message = {
        "id": str(uuid.uuid4()),
        "client_message_id": body.client_message_id,
        "role": "assistant",
        "text": generated.reply,
        "ts": now_iso(),
        "immediate_safety_concern": bool(immediate_match),
    }
    await db.sessions.update_one(
        {"id": session_id},
        {"$push": {"messages": assistant_message},
         "$set": {"conversation_analysis": analysis, "updated_at": now_iso()}},
    )
    return chat_response(assistant_message)


@api.get("/chat/history")
async def chat_history(session_id: str = Depends(current_victim)):
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Victim session not found")
    return {
        "messages": [
            {
                "id": item.get("id"),
                "role": item.get("role"),
                "text": item.get("text"),
                "ts": item.get("ts"),
                "client_message_id": item.get("client_message_id"),
            }
            for item in session.get("messages", [])
            if item.get("role") in {"user", "assistant"}
        ],
    }

def officer_can_access_conversation(case: dict, officer: dict) -> bool:
    if officer.get("role") == "admin":
        return True
    assigned_officer_id = case.get("assigned_officer_id")
    return bool(assigned_officer_id and assigned_officer_id == officer.get("officer_id"))


@api.get("/cases/{case_id}/conversation")
async def get_case_conversation(case_id: str, officer=Depends(current_officer)):
    case = await db.cases.find_one(
        {"$or": [{"id": case_id}, {"case_ref": case_id}]},
        {"_id": 0, "id": 1, "session_id": 1, "assigned_officer_id": 1},
    )
    if not case:
        raise HTTPException(404, "Case not found")
    if not officer_can_access_conversation(case, officer):
        raise HTTPException(403, "This conversation is not assigned to your account")
    if not case.get("session_id"):
        return {
            "messages": [],
            "ai_generated_summary": None,
            "explicit_facts": {},
            "fact_history": [],
            "unknown_fields": list(FACT_FIELDS),
            "potential_safety_concerns": [],
            "human_review_recommended": False,
        }

    session = await db.sessions.find_one(
        {"id": case["session_id"]},
        {"_id": 0, "messages": 1, "conversation_analysis": 1},
    )
    analysis = (session or {}).get("conversation_analysis") or {}
    return {
        "messages": [
            {
                "id": message.get("id"),
                "role": message.get("role"),
                "text": message.get("text"),
                "ts": message.get("ts"),
            }
            for message in (session or {}).get("messages", [])
            if message.get("role") in {"user", "assistant"}
        ],
        "ai_generated_summary": analysis.get("ai_summary"),
        "explicit_facts": analysis.get("explicit_facts", {}),
        "fact_history": analysis.get("fact_history", []),
        "unknown_fields": analysis.get("unknown_fields", list(FACT_FIELDS)),
        "potential_safety_concerns": analysis.get("potential_safety_concerns", []),
        "human_review_recommended": bool(analysis.get("human_review_recommended")),
    }

# Voice mock — simulates STT + acoustic features
MOCK_TRANSCRIPTS = [
    "They came again last night. They said if I go to the police again, they will burn my house. My children are scared. I can't sleep. Please help me, I don't know what to do.",
    "I filed a complaint two weeks ago about the assault at the well. Since then the men from the upper caste side have been threatening my family. I am afraid to leave the house.",
    "My husband was killed last month. They said it was an accident but I saw everything. Now they are threatening me to withdraw the statement. I feel completely alone.",
]

@api.post("/voice/mock-transcribe", response_model=VoiceMockOut)
async def voice_mock_transcribe(body: VoiceMockIn, session_id: str = Depends(current_victim)):
    if body.session_id != session_id:
        raise HTTPException(403, "Session does not match this token")
    import random
    t = random.choice(MOCK_TRANSCRIPTS)
    features = {
        "pitch_variance": round(random.uniform(0.35, 0.55), 2),
        "pause_ratio": round(random.uniform(0.25, 0.42), 2),
        "speech_rate": random.randint(120, 165),
        "energy": round(random.uniform(0.45, 0.7), 2),
        "jitter": round(random.uniform(0.04, 0.11), 2),
    }
    await db.sessions.update_one(
        {"id": body.session_id},
        {"$set": {"voice_transcript": t, "speech_features": features,
                  "updated_at": now_iso()},
         "$setOnInsert": {"id": body.session_id, "created_at": now_iso()}},
        upsert=True,
    )
    return {"transcript": t, "speech_features": features}
def speech_features_from_audio(duration_s: float, transcript: str) -> dict:
    words = len(transcript.split())
    rate = int(words / duration_s * 60) if duration_s > 0 else 0
    return {
        "pitch_variance": 0.42,
        "pause_ratio": round(max(0.05, min(0.6, 1 - rate / 180)), 2),
        "speech_rate": rate,
        "energy": 0.55,
        "jitter": 0.06,
        "duration_seconds": round(duration_s, 1),
    }

@api.post("/voice/transcribe", response_model=VoiceMockOut)
async def voice_transcribe(session_id: str = Form(...), duration: float = Form(0.0),
                           language: str = Form("en"), audio: UploadFile = File(...),
                           authenticated_session_id: str = Depends(current_victim)):
    if session_id != authenticated_session_id:
        raise HTTPException(403, "Session does not match this token")
    import io, tempfile
    data = await audio.read()
    if len(data) < 1000:
        raise HTTPException(400, "Recording too short or empty")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Recording exceeds 25 MB")
    try:
        from emergentintegrations.llm.openai import OpenAISpeechToText
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        ext = "webm" if "webm" in (audio.content_type or "") else (audio.filename or "audio.webm").rsplit(".", 1)[-1]
        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=True) as tmp:
            tmp.write(data); tmp.flush(); tmp.seek(0)
            resp = await stt.transcribe(file=open(tmp.name, "rb"), model="whisper-1",
                                        response_format="json", language=language or None,
                                        prompt="A distressed caller describing an incident to the NHAA 14566 helpline.")
        transcript = (resp.text or "").strip()
    except ModuleNotFoundError as e:
        if e.name and e.name.startswith("emergentintegrations"):
            logger.warning("Emergent speech integration is unavailable; mock transcription can be used for local demos.")
            raise HTTPException(
                503,
                "Speech transcription integration is unavailable. Using the mock transcription is suitable for local demos only.",
            ) from e
        logger.exception("whisper transcription failed")
        raise HTTPException(502, f"Transcription failed: {e}") from e
    except Exception as e:
        logger.exception("whisper transcription failed")
        raise HTTPException(502, f"Transcription failed: {e}") from e
    if not transcript:
        raise HTTPException(422, "We could not hear anything. Please try again.")
    features = speech_features_from_audio(duration, transcript)
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"voice_transcript": transcript, "speech_features": features, "updated_at": now_iso()},
         "$setOnInsert": {"id": session_id, "created_at": now_iso()}},
        upsert=True,
    )
    return {"transcript": transcript, "speech_features": features}


# Assessment
@api.post("/assessments")
async def create_assessment(body: AssessmentIn, session_id: str = Depends(current_victim)):
    if body.session_id != session_id:
        raise HTTPException(403, "Session does not match this token")
    session = await db.sessions.find_one({"id": session_id}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Victim session not found")
    rb = rule_based_scores(body.narrative, body.speech_features)
    llm = await llm_analyze(body.narrative)

    sub = {
        "stress": llm.get("stress", rb["stress"]),
        "fear": llm.get("fear", rb["fear"]),
        "anxiety": llm.get("anxiety", rb["anxiety"]),
        "trauma": llm.get("trauma", rb["trauma"]),
    }
    svi, risk = svi_and_risk(sub)
    factors = llm.get("factors") or [
        "Repeated fear/threat language in the narrative",
        "Reported lack of immediate support",
        "Indicators of ongoing risk to safety",
        "Emotional distress patterns detected",
    ]
    actions = llm.get("recommended_actions") or [
        "Priority human review by trained counselor",
        "Immediate safety assessment",
        "Consider referral to psychological support",
    ]
    voice_signals = body.speech_features or {}
    text_signals = rb["signals"]

    cid = str(uuid.uuid4())
    ref = f"NHAA-2026-{str(uuid.uuid4().int)[:5]}"
    doc = {
        "id": cid, "case_ref": ref, "channel": body.channel.capitalize(),
        "incident_category": body.incident_category or "unspecified",
        "svi_score": svi, "risk_category": risk,
        "sub_scores": sub,
        "voice_signals": voice_signals, "text_signals": text_signals,
        "factors": factors, "recommended_actions": actions,
        "narrative": body.narrative, "status": "awaiting_review",
        "assigned_officer": None, "session_id": body.session_id,
        "conversation_analysis": session.get("conversation_analysis"),
        "human_review_recommended": bool(
            (session.get("conversation_analysis") or {}).get("human_review_recommended")
        ),
        "created_at": now_iso(),
        "audit": [{"ts": now_iso(), "actor": "system", "event": "Case received", "note": "AI assessment generated"}],
    }
    await db.cases.insert_one(doc)
    doc.pop("_id", None)
    return doc

# Cases
@api.get("/cases")
async def list_cases(officer=Depends(current_officer),
                     risk: Optional[str] = None, status: Optional[str] = None,
                     q: Optional[str] = None, since: Optional[str] = None, limit: int = 100):
    query = {}
    if risk: query["risk_category"] = risk
    if status: query["status"] = status
    if since: query["created_at"] = {"$gt": since}
    if q:
        query["$or"] = [{"case_ref": {"$regex": q, "$options": "i"}},
                        {"narrative": {"$regex": q, "$options": "i"}},
                        {"incident_category": {"$regex": q, "$options": "i"}}]
    rows = await db.cases.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return rows
@api.get("/analytics/summary")
async def analytics_summary(days: int = 14, officer=Depends(current_officer)):
    rows = await db.cases.find({}, {"_id": 0, "created_at": 1, "risk_category": 1, "channel": 1,
                                    "svi_score": 1, "status": 1, "incident_category": 1}).to_list(5000)
    today = datetime.now(timezone.utc).date()
    day_keys = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    volume = {d: {"date": d, "total": 0, "critical": 0, "high": 0, "moderate": 0, "low": 0} for d in day_keys}
    risk, channels, categories = {}, {}, {}
    for r in rows:
        d, rk, ch = r["created_at"][:10], r.get("risk_category", "low"), r.get("channel", "Unknown")
        if d in volume:
            volume[d]["total"] += 1
            volume[d][rk] = volume[d].get(rk, 0) + 1
        risk[rk] = risk.get(rk, 0) + 1
        c = channels.setdefault(ch, {"channel": ch, "count": 0, "svi_sum": 0, "critical": 0})
        c["count"] += 1; c["svi_sum"] += r.get("svi_score", 0); c["critical"] += rk == "critical"
        cat = r.get("incident_category") or "unspecified"
        categories[cat] = categories.get(cat, 0) + 1
    for c in channels.values():
        c["avg_svi"] = round(c.pop("svi_sum") / c["count"]) if c["count"] else 0
    total = len(rows)
    return {
        "total": total,
        "avg_svi": round(sum(r.get("svi_score", 0) for r in rows) / total) if total else 0,
        "critical_share": round(100 * risk.get("critical", 0) / total) if total else 0,
        "resolved": sum(1 for r in rows if r.get("status") in ("reviewed", "closed")),
        "volume": list(volume.values()),
        "risk_mix": [{"risk": k, "count": v} for k, v in risk.items()],
        "channels": sorted(channels.values(), key=lambda x: -x["count"]),
        "categories": sorted([{"category": k, "count": v} for k, v in categories.items()], key=lambda x: -x["count"])[:6],
    }


@api.get("/cases/stats")
async def cases_stats(officer=Depends(current_officer)):
    total = await db.cases.count_documents({})
    critical = await db.cases.count_documents({"risk_category": "critical"})
    high = await db.cases.count_documents({"risk_category": "high"})
    awaiting = await db.cases.count_documents({"status": "awaiting_review"})
    today = datetime.now(timezone.utc).date().isoformat()
    reviewed_today = await db.cases.count_documents({"status": "reviewed", "created_at": {"$regex": f"^{today}"}})
    return {"total": total, "critical": critical, "high": high,
            "awaiting_review": awaiting, "reviewed_today": reviewed_today}

@api.get("/cases/{case_id}")
async def get_case(case_id: str, officer=Depends(current_officer)):
    c = await db.cases.find_one({"$or": [{"id": case_id}, {"case_ref": case_id}]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Case not found")
    return c

@api.patch("/cases/{case_id}/status")
async def update_case_status(case_id: str, body: CaseStatusUpdate, officer=Depends(current_officer)):
    entry = {"ts": now_iso(), "actor": officer["name"], "event": f"Status → {body.status}", "note": body.note or ""}
    r = await db.cases.update_one(
        {"$or": [{"id": case_id}, {"case_ref": case_id}]},
        {"$set": {"status": body.status, "assigned_officer": officer["name"],
                  "assigned_officer_id": officer["officer_id"]},
         "$push": {"audit": entry}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Case not found")
    return {"ok": True}

async def victim_case_for_session(case_id: str, session_id: str) -> dict:
    case = await db.cases.find_one(
        {"$or": [{"id": case_id}, {"case_ref": case_id}]},
        {"_id": 0},
    )
    if not case or case.get("session_id") != session_id:
        raise HTTPException(404, "Case not found")
    return case

def location_response(record: Optional[dict], include_details: bool = True) -> dict:
    if not record:
        return {"sharing_status": "not_shared"}
    fields = [
        "id", "case_id", "sharing_status", "created_at", "updated_at",
        "consented_at", "deletion_requested_at",
    ]
    if include_details:
        fields.extend([
            "latitude", "longitude", "address", "instructions", "accuracy_m", "source",
        ])
    result = {key: record[key] for key in fields if key in record}
    result["deletion_requested"] = bool(record.get("deletion_requested_at"))
    return result

@api.get("/victim/cases/{case_id}/location")
async def get_victim_location(case_id: str, session_id: str = Depends(current_victim)):
    case = await victim_case_for_session(case_id, session_id)
    record = await db.victim_locations.find_one({"case_id": case["id"]}, {"_id": 0})
    return location_response(record)

@api.post("/victim/cases/{case_id}/location")
async def share_victim_location(
    case_id: str,
    body: VictimLocationIn,
    session_id: str = Depends(current_victim),
):
    if not body.consent:
        raise HTTPException(400, "Consent is required before sharing location")
    case = await victim_case_for_session(case_id, session_id)
    address = body.address.strip() if body.address else None
    instructions = body.instructions.strip() if body.instructions else None
    if (body.latitude is None) != (body.longitude is None):
        raise HTTPException(422, "Latitude and longitude must be supplied together")
    if body.source == "gps":
        if body.latitude is None or body.longitude is None:
            raise HTTPException(422, "GPS sharing requires valid coordinates")
    elif body.latitude is not None or body.longitude is not None or body.accuracy_m is not None:
        raise HTTPException(422, "Manual locations must not include GPS coordinates")
    elif not address and not instructions:
        raise HTTPException(422, "Enter an address or nearby landmark for a manual location")

    existing = await db.victim_locations.find_one({"case_id": case["id"]}, {"_id": 0})
    if existing and existing.get("deletion_requested_at"):
        raise HTTPException(409, "A deletion request is pending for this location")

    submitted_at = now_iso()
    await db.victim_locations.update_one(
        {"case_id": case["id"]},
        {
            "$set": {
                "source": body.source,
                "latitude": body.latitude,
                "longitude": body.longitude,
                "address": address,
                "instructions": instructions,
                "accuracy_m": body.accuracy_m,
                "consent": True,
                "consented_at": submitted_at,
                "sharing_status": "shared",
                "updated_at": submitted_at,
                "deletion_requested_at": None,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "case_id": case["id"],
                "created_at": submitted_at,
            },
        },
        upsert=True,
    )
    record = await db.victim_locations.find_one({"case_id": case["id"]}, {"_id": 0})
    return location_response(record)

@api.post("/victim/cases/{case_id}/location/withdraw")
async def withdraw_victim_location(case_id: str, session_id: str = Depends(current_victim)):
    case = await victim_case_for_session(case_id, session_id)
    updated_at = now_iso()
    result = await db.victim_locations.update_one(
        {"case_id": case["id"]},
        {"$set": {"sharing_status": "withdrawn", "updated_at": updated_at}},
    )
    if not result.matched_count:
        raise HTTPException(404, "No shared location was found")
    record = await db.victim_locations.find_one({"case_id": case["id"]}, {"_id": 0})
    return location_response(record)

@api.post("/victim/cases/{case_id}/location/deletion-request")
async def request_victim_location_deletion(case_id: str, session_id: str = Depends(current_victim)):
    case = await victim_case_for_session(case_id, session_id)
    record = await db.victim_locations.find_one({"case_id": case["id"]}, {"_id": 0})
    if not record:
        raise HTTPException(404, "No shared location was found")
    requested_at = now_iso()
    await db.victim_locations.update_one(
        {"case_id": case["id"]},
        {"$set": {
            "sharing_status": "withdrawn",
            "deletion_requested_at": requested_at,
            "updated_at": requested_at,
        }},
    )
    updated_record = await db.victim_locations.find_one({"case_id": case["id"]}, {"_id": 0})
    return location_response(updated_record)

@api.get("/cases/{case_id}/location")
async def get_officer_victim_location(case_id: str, officer=Depends(current_officer)):
    case = await db.cases.find_one(
        {"$or": [{"id": case_id}, {"case_ref": case_id}]},
        {"_id": 0, "id": 1, "assigned_officer": 1, "assigned_officer_id": 1},
    )
    if not case or not officer_can_access_case(case, officer):
        raise HTTPException(404, "Case not found")
    record = await db.victim_locations.find_one({"case_id": case["id"]}, {"_id": 0})
    if not record:
        return {"sharing_status": "not_shared"}
    return location_response(record, include_details=record.get("sharing_status") == "shared")

# ---------- Startup ----------
@app.on_event("startup")
async def _startup():
    await db.victim_locations.create_index("case_id", unique=True)
    await db.chat_rate_limits.create_index("expires_at", expireAfterSeconds=0)
    await seed_officers()
    logger.info("NHAA backend started, demo officers seeded.")

@app.on_event("shutdown")
async def _shutdown():
    client.close()

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

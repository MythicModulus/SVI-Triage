import VictimShell from "../components/VictimShell";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Mic, Square, Loader2, ArrowRight, MessageSquare } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useLanguage } from "../lib/i18n";

const STATES = { READY: "ready", LISTENING: "listening", PROCESSING: "processing", DONE: "done" };
const SPEECH_LANGUAGES = {
  en: "en-IN",
  hi: "hi-IN",
  bn: "bn-IN",
  mr: "mr-IN",
  ta: "ta-IN",
  te: "te-IN",
};

function speechErrorMessage(code, t) {
  const messages = {
    "not-allowed": "Microphone access was blocked. Allow microphone access in your browser settings and try again.",
    "service-not-allowed": "Speech recognition is unavailable in this browser. Use the chat option below.",
    "no-speech": "We did not hear any speech. Please try again or use the chat option below.",
    network: "The browser speech-recognition service could not be reached. Check your connection and try again.",
    language: "Speech recognition is not available for the selected language in this browser.",
  };
  return t(messages[code] || "Speech recognition could not start. Please try again or use the chat option below.");
}

export default function VictimVoice() {
  const { language, t } = useLanguage();
  const [state, setState] = useState(STATES.READY);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [features, setFeatures] = useState(null);
  const [error, setError] = useState("");
  const nav = useNavigate();
  const timer = useRef();
  const recognition = useRef(null);
  const transcriptRef = useRef("");
  const recognitionFailed = useRef(false);
  const secondsRef = useRef(0);

  useEffect(() => () => {
    clearInterval(timer.current);
    recognition.current?.abort();
  }, []);

  const start = async () => {
    setError("");
    setTranscript("");
    setLiveTranscript("");
    setFeatures(null);
    transcriptRef.current = "";
    recognitionFailed.current = false;
    setSeconds(0);
    secondsRef.current = 0;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(t("This browser does not support speech recognition. Please use Chrome or the chat option below."));
      return;
    }

    const recognizer = new SpeechRecognition();
    recognizer.lang = SPEECH_LANGUAGES[language] || "en-IN";
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.onstart = () => {
      setState(STATES.LISTENING);
      timer.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
      }, 1000);
    };
    recognizer.onresult = (event) => {
      const finalParts = [];
      const interimParts = [];
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalParts.push(result[0].transcript.trim());
        else interimParts.push(result[0].transcript.trim());
      }
      transcriptRef.current = finalParts.filter(Boolean).join(" ");
      setTranscript(transcriptRef.current);
      setLiveTranscript(interimParts.filter(Boolean).join(" "));
    };
    recognizer.onerror = (event) => {
      recognitionFailed.current = true;
      clearInterval(timer.current);
      recognition.current = null;
      setError(speechErrorMessage(event.error, t));
      setState(STATES.READY);
    };
    recognizer.onend = () => {
      clearInterval(timer.current);
      recognition.current = null;
      if (recognitionFailed.current) return;
      setLiveTranscript("");
      if (!transcriptRef.current) {
        setError(t("We did not hear any speech. Please try again or use the chat option below."));
        setState(STATES.READY);
        return;
      }
      setFeatures({});
      setState(STATES.DONE);
    };
    recognition.current = recognizer;
    try {
      recognizer.start();
    } catch {
      recognition.current = null;
      setError(t("Speech recognition could not start. Please check microphone access and try again."));
    }
  };

  const stop = () => {
    clearInterval(timer.current);
    setState(STATES.PROCESSING);
    recognition.current?.stop();
  };

  const submit = () => {
    sessionStorage.setItem("nhaa_narrative", transcript);
    sessionStorage.setItem("nhaa_features", JSON.stringify(features || {}));
    sessionStorage.setItem("nhaa_channel", "voice");
    nav("/victim/assessment");
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <VictimShell>
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="mb-8">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">{t("Voice Support")}</div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900">{t("Take your time.")}</h1>
          <p className="mt-3 text-slate-600 leading-relaxed">
            {t("Tell us what happened in your own words. You do not need to remember everything at once. You can stop at any time.")}
          </p>
          <p role="note" className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            {t("Speech recognition is handled by your browser. Depending on the browser, audio may be processed by its speech service; it is not uploaded to the NHAA app server. Recognition and language support vary.")}
          </p>
        </div>

        <Card className="p-10 sm:p-14 rounded-3xl border-slate-200 bg-white flex flex-col items-center text-center">
          {state === STATES.READY && (
            <>
              <button
                onClick={start}
                data-testid="voice-record-start-button"
                className="h-32 w-32 sm:h-40 sm:w-40 rounded-full bg-gradient-to-br from-[#0F2C59] to-[#1E3A8A] text-white flex items-center justify-center shadow-lg hover:shadow-xl transition-all active:scale-95"
              >
                <Mic className="h-14 w-14 sm:h-16 sm:w-16" strokeWidth={1.8} />
              </button>
              <div className="mt-6 font-display text-xl font-semibold text-slate-900">{t("Tap to speak")}</div>
              <div className="mt-1 text-sm text-slate-500">{t("You can stop at any time.")}</div>
              {error && (
                <div data-testid="voice-error-message" className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3 max-w-md">{error}</div>
              )}
            </>
          )}

          {state === STATES.LISTENING && (
            <>
              <div className="relative h-32 w-32 sm:h-40 sm:w-40 flex items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-red-500/20 mic-pulse" />
                <span className="absolute inset-4 rounded-full bg-red-500/30 mic-pulse" style={{ animationDelay: "0.3s" }} />
                <div className="relative h-24 w-24 sm:h-28 sm:w-28 rounded-full bg-red-600 flex items-center justify-center text-white">
                  <Mic className="h-10 w-10 sm:h-12 sm:w-12" />
                </div>
              </div>
              <div className="flex items-end gap-1 h-10 mt-6">
                {[0.1, 0.4, 0.2, 0.6, 0.3, 0.7, 0.35, 0.55, 0.2, 0.5, 0.3].map((d, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-slate-900 wave-bar"
                    style={{ height: `${d * 100}%`, animationDelay: `${i * 0.08}s` }}
                  />
                ))}
              </div>
              <div className="mt-4 font-mono text-2xl text-slate-900" data-testid="recording-timer">{mmss}</div>
              <div className="text-sm text-slate-500">{t("Listening… Speak clearly; your words will appear here.")}</div>
              {(transcript || liveTranscript) && (
                <div aria-live="polite" className="mt-4 w-full max-w-xl rounded-lg bg-slate-50 p-3 text-left text-sm text-slate-700">
                  {transcript}{" "}<span className="text-slate-400">{liveTranscript}</span>
                </div>
              )}
              <Button
                onClick={stop} data-testid="voice-record-stop-button"
                className="mt-6 bg-slate-900 hover:bg-slate-800 text-white"
              >
                <Square className="h-4 w-4 mr-2 fill-current" /> {t("Stop recording")}
              </Button>
            </>
          )}

          {state === STATES.PROCESSING && (
            <>
              <Loader2 className="h-16 w-16 text-slate-700 animate-spin" />
              <div className="mt-6 font-display text-xl font-semibold text-slate-900">{t("Understanding your response…")}</div>
              <div className="mt-1 text-sm text-slate-500">{t("This may take a few seconds.")}</div>
            </>
          )}

          {state === STATES.DONE && (
            <div className="w-full text-left">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">{t("Transcript")}</div>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                data-testid="voice-transcript-textarea"
                className="w-full min-h-[160px] p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#0F2C59]"
              />
              <div className="text-xs text-slate-500 mt-2">{t("You can edit this before continuing.")}</div>
              <Button
                onClick={submit} data-testid="voice-submit-button"
                className="mt-6 w-full bg-[#0F2C59] hover:bg-[#1E3A8A] text-white h-12"
              >
                {t("Continue")} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
        </Card>

        <div className="mt-6 text-center">
          <Link to="/victim/chat" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900" data-testid="prefer-chat-link">
            <MessageSquare className="h-4 w-4" /> {t("Prefer typing instead?")}
          </Link>
        </div>
      </section>
    </VictimShell>
  );
}

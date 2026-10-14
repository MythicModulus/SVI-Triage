import VictimShell from "../components/VictimShell";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Mic, MessageSquare, ShieldAlert, HeartHandshake, Lock, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ensureVictimSession } from "../lib/api";
import { useLanguage } from "../lib/i18n";

export default function VictimLanding() {
  const nav = useNavigate();
  const { t } = useLanguage();
  const [sessionError, setSessionError] = useState("");

  useEffect(() => {
    ensureVictimSession().catch(() => {
      setSessionError(t("We could not start a secure session. Please refresh and try again."));
    });
  }, []);

  const modes = [
    {
      to: "/victim/voice", icon: Mic, testid: "victim-voice-mode-button",
      title: t("Talk to us"),
      desc: t("Speak in your own voice. You do not need to remember everything."),
      accent: "from-[#0F2C59] to-[#1E3A8A]",
    },
    {
      to: "/victim/chat", icon: MessageSquare, testid: "victim-chat-mode-button",
      title: t("Chat with us"),
      desc: t("Type or use quick replies. Take your time."),
      accent: "from-slate-700 to-slate-900",
    },
    {
      to: "/victim/chat", icon: HeartHandshake, testid: "victim-write-mode-button",
      title: t("Write what happened"),
      desc: t("Describe the incident in your own words."),
      accent: "from-[#065F46] to-[#047857]",
    },
  ];

  return (
    <VictimShell>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-10">
        {sessionError && (
          <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {sessionError}
          </div>
        )}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-medium text-slate-600 mb-6">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {t("Confidential · Free · 24 × 7 support")}
          </div>
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
            {t("We are here to listen")}<span className="text-[#0F2C59]">.</span>
            <br /> {t("You are not alone.")}
          </h1>
          <p className="mt-5 text-slate-600 text-base sm:text-lg leading-relaxed max-w-2xl">
            {t("The National Helpline Against Atrocities (NHAA 14566) provides safe and confidential support to victims and complainants of caste-based violence, harassment and discrimination. You can share what happened in the way that feels safest.")}
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4">
          {modes.map((m) => (
            <Link key={m.title} to={m.to} data-testid={m.testid} className="group">
              <Card className="p-6 h-full border border-slate-200 hover:border-slate-300 hover:shadow-md transition-all bg-white rounded-2xl">
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${m.accent} flex items-center justify-center text-white mb-4`}>
                  <m.icon className="h-6 w-6" strokeWidth={2} />
                </div>
                <h3 className="font-display text-xl font-semibold text-slate-900">{m.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{m.desc}</p>
              </Card>
            </Link>
          ))}
        </div>

        <Card className="mt-8 p-5 sm:p-6 border-red-200 bg-red-50/60 rounded-2xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-lg bg-red-600 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">{t("Are you in immediate danger?")}</div>
                <div className="text-sm text-slate-600">{t("You can call 14566 directly or request urgent help now.")}</div>
              </div>
            </div>
            <Button
              onClick={() => nav("/victim/emergency")}
              data-testid="emergency-sos-button"
              className="bg-red-600 hover:bg-red-700 text-white shrink-0"
            >
              {t("Get urgent help")}
            </Button>
          </div>
        </Card>

        <div className="mt-14">
          <h2 className="font-display text-2xl font-semibold text-slate-900">{t("How this works")}</h2>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              ["Tell us what happened", "Voice or chat — whichever feels safe."],
              ["We assess your needs", "AI-assisted screening to prioritise support."],
              ["Trained officer reviews", "A human always makes the decisions."],
              ["Right support reaches you", "Legal, medical or psychological."],
            ].map(([title, description], i) => (
              <Card key={title} className="p-4 rounded-xl border-slate-200 bg-white">
                <div className="text-xs font-mono text-slate-400 mb-1">STEP 0{i + 1}</div>
                <div className="font-semibold text-slate-900 text-sm">{t(title)}</div>
                <div className="mt-1 text-xs text-slate-500 leading-relaxed">{t(description)}</div>
              </Card>
            ))}
          </div>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200">
            <Lock className="h-4 w-4 text-slate-500" />
            <span className="text-slate-600">{t("Your information is handled securely under India’s DPDP Act principles.")}</span>
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200">
            <Users className="h-4 w-4 text-slate-500" />
            <span className="text-slate-600">{t("Every case is reviewed by a trained NHAA officer — never by AI alone.")}</span>
          </div>
        </div>
      </section>
    </VictimShell>
  );
}

import VictimShell from "../components/VictimShell";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { CheckCircle2, Circle, Loader2, Home, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { victimApi, ensureVictimSession } from "../lib/api";
import { useLanguage } from "../lib/i18n";
import VictimLocation from "../components/VictimLocation";

const STAGES = [
  "Conversation received",
  "Speech and text processed",
  "Identifying relevant indicators",
  "Preparing support priority",
];

export default function VictimAssessment() {
  const { t } = useLanguage();
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    const narrative = sessionStorage.getItem("nhaa_narrative") || "";
    const features = JSON.parse(sessionStorage.getItem("nhaa_features") || "null");
    const channel = sessionStorage.getItem("nhaa_channel") || "chat";
    let cancelled = false;
    const t1 = setTimeout(() => !cancelled && setStage(1), 900);
    const t2 = setTimeout(() => !cancelled && setStage(2), 1900);
    const t3 = setTimeout(() => !cancelled && setStage(3), 2900);

    (async () => {
      try {
        const sid = await ensureVictimSession();
        const r = await victimApi.post("/assessments", {
          session_id: sid, channel, narrative, speech_features: features,
        });
        if (!cancelled) {
          // Wait for the visual staging to finish before revealing
          setTimeout(() => !cancelled && setResult(r.data), 3200);
        }
      } catch (e) {
        if (!cancelled) setResult({ error: true });
      }
    })();

    return () => { cancelled = true; [t1, t2, t3].forEach(clearTimeout); };
  }, []);

  const riskTone = (r) => ({
    critical: "bg-red-600 text-white",
    high: "bg-orange-500 text-white",
    moderate: "bg-yellow-500 text-slate-900",
    low: "bg-emerald-600 text-white",
  }[r] || "bg-slate-500 text-white");

  return (
    <VictimShell>
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-2">{t("Initial Assessment")}</div>
          <h1 className="font-display text-3xl font-bold text-slate-900">{t("Preparing your initial assessment")}</h1>
          <p className="mt-2 text-slate-600 text-sm">
            {t("AI-assisted screening — not a medical diagnosis.")}
          </p>
        </div>

        {!result && (
          <Card className="p-8 rounded-2xl border-slate-200 bg-white">
            <div className="flex items-center gap-3 mb-6">
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              <div className="text-sm text-slate-700 font-medium">{t("Analysing your response securely…")}</div>
            </div>
            <div className="space-y-3">
              {STAGES.map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  {i < stage ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    : i === stage ? <Loader2 className="h-5 w-5 text-[#0F2C59] animate-spin" />
                    : <Circle className="h-5 w-5 text-slate-300" />}
                  <div className={`text-sm ${i <= stage ? "text-slate-900 font-medium" : "text-slate-400"}`}>{t(s)}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {result && !result.error && (
          <div className="space-y-5" data-testid="assessment-result">
            <Card className="p-6 rounded-2xl border-slate-200 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-slate-500">{t("Overall Support Priority")}</div>
                  <div className="mt-1 font-display text-4xl font-bold text-slate-900">
                    <span data-testid="svi-score">{result.svi_score}</span>
                    <span className="text-lg text-slate-400 font-normal ml-1">/ 100</span>
                  </div>
                </div>
                <div className={`px-4 py-2 rounded-full text-sm font-semibold ${riskTone(result.risk_category)}`} data-testid="risk-badge">
                  {t(result.risk_category.toUpperCase())}
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  [t("Stress"), result.sub_scores.stress],
                  [t("Fear"), result.sub_scores.fear],
                  [t("Anxiety"), result.sub_scores.anxiety],
                  [t("Trauma"), result.sub_scores.trauma],
                ].map(([k, v]) => (
                  <div key={k} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-[11px] font-mono uppercase text-slate-500">{k}</div>
                    <div className="font-mono text-xl font-semibold text-slate-900 mt-1">{v}<span className="text-xs text-slate-400">/100</span></div>
                    <Progress value={v} className="h-1.5 mt-2" />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 rounded-2xl border-slate-200 bg-white">
              <h3 className="font-display text-lg font-semibold text-slate-900">{t("What influenced this assessment")}</h3>
              <ul className="mt-4 space-y-2.5">
                {result.factors.map((f, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /> {t(f)}
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-6 rounded-2xl border-emerald-200 bg-emerald-50/60">
              <div className="flex items-start gap-4">
                <Info className="h-5 w-5 text-emerald-700 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-900">{t("Your information has been submitted for review.")}</div>
                  <div className="mt-1 text-sm text-slate-700">
                    {t("A trained NHAA officer will review the information and determine the appropriate next steps.")}
                  </div>
                  <div className="mt-3 text-xs font-mono uppercase text-slate-500">{t("Case reference")}</div>
                  <div className="font-mono text-lg font-semibold text-slate-900" data-testid="case-reference">{result.case_ref}</div>
                </div>
              </div>
            </Card>

            <VictimLocation caseId={result.id || result.case_id} />
            <Button onClick={() => nav("/")} className="w-full sm:w-auto h-11 bg-slate-900 hover:bg-slate-800 text-white" data-testid="return-home-button">
              <Home className="h-4 w-4 mr-2" /> {t("Return home")}
            </Button>
          </div>
        )}
      </section>
    </VictimShell>
  );
}

import OfficerShell from "../components/OfficerShell";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "../components/ui/alert-dialog";
import { AudioWaveform, Radar, CheckCircle2, Clock, User, MapPin, Info, FileText, ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { officerApi, riskColor, riskLabel } from "../lib/api";
import { toast } from "sonner";
import OfficerVictimLocation from "../components/OfficerVictimLocation";
import OfficerConversationReview from "../components/OfficerConversationReview";

export default function OfficerCaseDetail() {
  const { id } = useParams();
  const [c, setC] = useState(null);

  const load = () => officerApi.get(`/cases/${id}`).then((r) => setC(r.data));
  useEffect(() => {
    load();
  }, [id]);

  const updateStatus = async (status, note = "") => {
    await officerApi.patch(`/cases/${id}/status`, { status, note });
    toast.success(`Status updated to ${status.replace("_", " ")}`);
    load();
  };

  if (!c) return <OfficerShell><div className="text-slate-400">Loading…</div></OfficerShell>;

  return (
    <OfficerShell>
      <div className="mb-2">
        <Link to="/officer/cases" className="text-sm text-slate-400 hover:text-white">← Back to cases</Link>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500">Case</div>
          <h1 className="font-display text-3xl font-bold text-white font-mono">{c.case_ref}</h1>
          <div className="mt-1 text-sm text-slate-400">
            {c.channel} · <span className="capitalize">{c.incident_category}</span> · {new Date(c.created_at).toLocaleString()}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider ${riskColor(c.risk_category)}`}>
            {riskLabel(c.risk_category)} RISK
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-300 capitalize">
            {c.status.replace("_", " ")}
          </span>
        </div>
      </div>

      {c.risk_category === "critical" && (
        <Card className="p-5 mb-5 rounded-2xl bg-red-950/40 border-red-900/50">
          <div className="flex items-start gap-3">
            <ArrowUp className="h-5 w-5 text-red-400 mt-0.5" />
            <div>
              <div className="font-semibold text-white">URGENT HUMAN REVIEW REQUIRED</div>
              <div className="text-sm text-red-200/80 mt-1">
                AI screening detected indicators of ongoing risk. Please assess the case immediately —
                the AI is not authorised to make protection decisions.
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <OfficerVictimLocation caseId={id} />
        <OfficerConversationReview caseId={id} />
        <Card className="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <Radar className="h-4 w-4 text-slate-400" />
            <h2 className="font-display text-lg font-semibold text-white">AI Assessment</h2>
          </div>
          <div className="flex items-end gap-4 mb-6">
            <div>
              <div className="text-xs font-mono uppercase text-slate-500">Stress Vulnerability Index</div>
              <div className="font-display text-6xl font-bold text-white leading-none mt-1" data-testid="svi-score-card">{c.svi_score}</div>
            </div>
            <div className="text-slate-500 pb-2 font-mono text-sm">/ 100</div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["Stress", c.sub_scores.stress],
              ["Fear", c.sub_scores.fear],
              ["Anxiety", c.sub_scores.anxiety],
              ["Trauma", c.sub_scores.trauma],
            ].map(([k, v]) => (
              <div key={k} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[11px] font-mono uppercase text-slate-500">{k}</div>
                <div className="font-mono text-2xl font-semibold text-white mt-1">{v}</div>
                <Progress value={v} className="h-1 mt-2 bg-slate-800" />
              </div>
            ))}
          </div>
          <div className="mt-4 text-[11px] text-slate-500 flex items-center gap-1.5">
            <Info className="h-3 w-3" /> AI-assisted screening — not a medical diagnosis.
          </div>
        </Card>

        <Card className="p-6 rounded-2xl bg-slate-900 border-slate-800">
          <h2 className="font-display text-lg font-semibold text-white mb-4">Officer actions</h2>
          <div className="space-y-2">
            <Button onClick={() => updateStatus("under_review")} className="w-full justify-start bg-slate-800 hover:bg-slate-700 text-white" data-testid="action-mark-review">
              <User className="h-4 w-4 mr-2" /> Mark under review
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full justify-start bg-orange-600 hover:bg-orange-700 text-white" data-testid="escalate-case-action-btn">
                  <ArrowUp className="h-4 w-4 mr-2" /> Escalate case
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Escalate this case?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will flag the case for senior review and trigger an audit-trail entry.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => updateStatus("escalated", "Escalated by officer for senior review")}>
                    Confirm escalation
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full justify-start bg-emerald-700 hover:bg-emerald-800 text-white" data-testid="action-close">
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Close case
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close this case?</AlertDialogTitle>
                  <AlertDialogDescription>Confirm that appropriate action has been taken.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => updateStatus("closed", "Officer closed case after review")}>
                    Confirm close
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl bg-slate-900 border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <AudioWaveform className="h-4 w-4 text-slate-400" />
            <h3 className="font-display font-semibold text-white">Voice signals</h3>
          </div>
          <div className="space-y-2 text-sm">
            <SignalRow k="Pitch variance" v={c.voice_signals?.pitch_variance ?? "—"} />
            <SignalRow k="Pause ratio" v={c.voice_signals?.pause_ratio ?? "—"} />
            <SignalRow k="Speech rate (wpm)" v={c.voice_signals?.speech_rate ?? "—"} />
            <SignalRow k="Vocal energy" v={c.voice_signals?.energy ?? "—"} />
            <SignalRow k="Jitter proxy" v={c.voice_signals?.jitter ?? "—"} />
          </div>
        </Card>

        <Card className="p-6 rounded-2xl bg-slate-900 border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4 text-slate-400" />
            <h3 className="font-display font-semibold text-white">Text signals</h3>
          </div>
          <div className="space-y-2 text-sm">
            <SignalRow k="Fear keywords" v={c.text_signals?.fear_keywords ?? "—"} />
            <SignalRow k="Threat keywords" v={c.text_signals?.threat_keywords ?? "—"} />
            <SignalRow k="Urgency" v={c.text_signals?.urgency ?? "—"} />
            <SignalRow k="Distress score" v={c.text_signals?.distress_score ?? "—"} />
          </div>
        </Card>

        <Card className="p-6 rounded-2xl bg-slate-900 border-slate-800" data-testid="explainable-ai-factors-card">
          <h3 className="font-display font-semibold text-white mb-4">Why prioritised</h3>
          <ul className="space-y-2.5">
            {c.factors.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" /> {f}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-slate-400" />
            <h3 className="font-display font-semibold text-white">Original narrative</h3>
            <span className="ml-auto text-[10px] font-mono uppercase text-slate-500">Sensitive · authorised access only</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{c.narrative}</p>
        </Card>

        <Card className="p-6 rounded-2xl bg-slate-900 border-slate-800">
          <h3 className="font-display font-semibold text-white mb-3">Recommended next steps</h3>
          <ul className="space-y-2 text-sm text-slate-300">
            {c.recommended_actions.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" /> {r}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-3 p-6 rounded-2xl bg-slate-900 border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-slate-400" />
            <h3 className="font-display font-semibold text-white">Audit trail</h3>
          </div>
          <div className="space-y-3">
            {(c.audit || []).map((e, i) => (
              <div key={i} className="flex gap-4 text-sm">
                <div className="font-mono text-xs text-slate-500 w-40 shrink-0">{new Date(e.ts).toLocaleString()}</div>
                <div className="flex-1">
                  <div className="text-slate-200 font-medium">{e.event}</div>
                  <div className="text-slate-500 text-xs mt-0.5">{e.actor}{e.note ? ` — ${e.note}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </OfficerShell>
  );
}

function SignalRow({ k, v }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800 py-1.5 last:border-0">
      <span className="text-slate-400 text-xs uppercase tracking-wider">{k}</span>
      <span className="font-mono text-white font-semibold">{v}</span>
    </div>
  );
}

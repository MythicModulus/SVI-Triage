import OfficerShell from "../components/OfficerShell";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { AlertTriangle, ArrowUpRight, ClipboardList, Users, Clock, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { officerApi, riskColor, riskLabel } from "../lib/api";
import { Link } from "react-router-dom";

const REFRESH_INTERVAL_MS = 15000;

export default function OfficerDashboard() {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(false);
  const [cases, setCases] = useState([]);
  const [flash, setFlash] = useState(new Set());

  const load = async () => {
    const [statsResult, casesResult] = await Promise.allSettled([
      officerApi.get("/cases/stats"),
      officerApi.get("/cases", { params: { limit: 20 } }),
    ]);

    if (statsResult.status === "fulfilled") {
      setStats(statsResult.value.data);
      setStatsError(false);
    } else {
      console.error("Unable to load officer dashboard statistics", statsResult.reason);
      setStatsError(true);
    }

    if (casesResult.status === "fulfilled") {
      setCases(casesResult.value.data);
    } else {
      console.error("Unable to load officer dashboard cases", casesResult.reason);
    }
  };
  useEffect(() => {
    load();
    const interval = window.setInterval(load, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const onNewCritical = (rows) => {
    load();
    setFlash(new Set(rows.map((c) => c.id)));
    setTimeout(() => setFlash(new Set()), 15000);
  };


  const priorityCases = cases.filter((c) => ["critical", "high"].includes(c.risk_category));

  return (
    <OfficerShell onNewCritical={onNewCritical}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Command Overview</h1>
          <p className="text-slate-400 text-sm mt-1">AI-prioritised cases from NHAA 14566, portal, chatbot, IVRS and mobile app.</p>
        </div>
                <Badge className="bg-slate-800 text-slate-300 border border-slate-700 uppercase tracking-wider text-[10px]" data-testid="live-badge">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" /> Live alerts on
        </Badge>
        
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total cases" value={stats?.total ?? "…"} icon={ClipboardList} testid="stat-total" />
        <StatCard label="Critical" value={stats?.critical ?? "…"} icon={AlertTriangle} accent="text-red-400" testid="stat-critical" />
        <StatCard label="High priority" value={stats?.high ?? "…"} icon={ArrowUpRight} accent="text-orange-400" testid="stat-high" />
        <StatCard label="Awaiting review" value={stats?.awaiting_review ?? "…"} icon={Clock} accent="text-amber-400" testid="stat-awaiting" />
      </div>

      {statsError && (
        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          <span>Dashboard counts could not be loaded. Check the backend connection and try again.</span>
          <button onClick={load} className="font-semibold text-white underline underline-offset-2">
            Retry
          </button>
        </div>
      )}

      {priorityCases.length > 0 && (
        <Card className="p-5 mb-8 rounded-2xl bg-red-950/40 border-red-900/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5" />
            <div>
              <div className="font-semibold text-white">Requires immediate human review</div>
              <div className="text-sm text-red-200/80 mt-0.5">
                {priorityCases.length} case{priorityCases.length > 1 ? "s" : ""} flagged as critical or high risk by AI screening.
                Final decisions remain with authorised personnel.
              </div>
            </div>
          </div>
        </Card>
      )}

      <Card className="rounded-2xl bg-slate-900 border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Priority cases</h2>
            <p className="text-xs text-slate-400 mt-0.5">Sorted by most recent · AI-assisted prioritisation</p>
          </div>
          <Link to="/officer/cases" className="text-sm text-slate-300 hover:text-white flex items-center gap-1" data-testid="view-all-cases-link">
            View all <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="case-list-table">
            <thead className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Case</th>
                <th className="text-left px-5 py-3">Channel</th>
                <th className="text-left px-5 py-3">Category</th>
                <th className="text-right px-5 py-3">SVI</th>
                <th className="text-left px-5 py-3">Risk</th>
                <th className="text-left px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {cases.slice(0, 10).map((c) => (
                <tr key={c.id} className={`border-t border-slate-800 hover:bg-slate-800/40 cursor-pointer ${flash.has(c.id) ? "bg-red-950/50 animate-pulse" : ""}`} data-testid="case-row-item">
                  <td className="px-5 py-3">
                    <Link to={`/officer/cases/${c.case_ref}`} className="font-mono text-white hover:underline">{c.case_ref}</Link>
                    <div className="text-[11px] text-slate-500 mt-0.5">{new Date(c.created_at).toLocaleString()}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-300">{c.channel}</td>
                  <td className="px-5 py-3 text-slate-300 capitalize">{c.incident_category}</td>
                  <td className="px-5 py-3 text-right font-mono font-semibold text-white">{c.svi_score}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${riskColor(c.risk_category)}`}>
                      {riskLabel(c.risk_category)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-400 capitalize">{c.status.replace("_", " ")}</td>
                </tr>
              ))}
              {cases.length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-slate-500">No cases yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-6 flex items-start gap-3 text-xs text-slate-500 max-w-3xl">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>AI assessments support prioritisation. Final decisions on protection, legal action and psychological
          referrals remain with authorised NHAA personnel — the AI never acts autonomously.</div>
      </div>
    </OfficerShell>
  );
}

function StatCard({ label, value, icon: Icon, accent = "text-slate-300", testid }) {
  return (
    <Card className="p-5 rounded-2xl bg-slate-900 border-slate-800" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono uppercase tracking-wider text-slate-500">{label}</div>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="mt-3 font-display text-3xl font-bold text-white">{value}</div>
    </Card>
  );
}

import OfficerShell from "../components/OfficerShell";
import { Card } from "../components/ui/card";
import { useEffect, useState } from "react";
import { officerApi } from "../lib/api";
import { BarChart3, Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

const RISK_COLORS = { critical: "#DC2626", high: "#D97706", moderate: "#CA8A04", low: "#16A34A" };
const RISK_ORDER = ["critical", "high", "moderate", "low"];
const TT = { contentStyle: { background: "#0F172A", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }, labelStyle: { color: "#E2E8F0" } };

export default function OfficerAnalytics() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(14);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    setError(false);
    officerApi.get("/analytics/summary", { params: { days } })
      .then((response) => {
        if (active) setData(response.data);
      })
      .catch((requestError) => {
        if (!active) return;
        console.error("Unable to load officer analytics", requestError);
        setError(true);
      });
    return () => { active = false; };
  }, [days, retryCount]);

  const riskMix = RISK_ORDER.map((r) => ({ risk: r, count: data?.risk_mix.find((x) => x.risk === r)?.count || 0 }));

  return (
    <OfficerShell>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Analytics</h1>
          <p className="text-slate-400 text-sm mt-1">MoSJE overview · case volume, risk mix and channel performance.</p>
        </div>
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1" data-testid="analytics-range">
          {[7, 14, 30].map((d) => (
            <button key={d} onClick={() => setDays(d)} data-testid={`analytics-range-${d}`}
              className={`px-3 py-1 rounded-md text-xs font-mono ${days === d ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          <span>Analytics data could not be loaded. Check the backend connection and try again.</span>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="font-semibold text-white underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Kpi label="Total cases" value={data?.total} icon={BarChart3} testid="kpi-total" />
        <Kpi label="Average SVI" value={data?.avg_svi} icon={Activity} accent="text-blue-400" testid="kpi-avg-svi" />
        <Kpi label="Critical share" value={data ? `${data.critical_share}%` : undefined} icon={AlertTriangle} accent="text-red-400" testid="kpi-critical-share" />
        <Kpi label="Reviewed / closed" value={data?.resolved} icon={CheckCircle2} accent="text-emerald-400" testid="kpi-resolved" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Panel title="Case volume by day" subtitle="Stacked by risk category" className="lg:col-span-2" testid="chart-volume">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data?.volume || []} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1E293B" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="#64748B" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip {...TT} />
              {RISK_ORDER.map((r) => (
                <Area key={r} type="monotone" dataKey={r} stackId="1" stroke={RISK_COLORS[r]} fill={RISK_COLORS[r]} fillOpacity={0.35} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Risk mix" subtitle="All cases" testid="chart-risk-mix">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={riskMix} dataKey="count" nameKey="risk" innerRadius={55} outerRadius={85} paddingAngle={3} stroke="none">
                {riskMix.map((e) => <Cell key={e.risk} fill={RISK_COLORS[e.risk]} />)}
              </Pie>
              <Tooltip {...TT} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {riskMix.map((e) => (
              <div key={e.risk} className="flex items-center gap-2 text-xs text-slate-300">
                <span className="h-2 w-2 rounded-full" style={{ background: RISK_COLORS[e.risk] }} />
                <span className="capitalize">{e.risk}</span>
                <span className="ml-auto font-mono text-white">{e.count}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Channel breakdown" subtitle="Cases and average SVI per intake channel" testid="chart-channels">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.channels || []} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="#1E293B" vertical={false} />
              <XAxis dataKey="channel" stroke="#64748B" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748B" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip {...TT} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="count" name="Cases" fill="#2563EB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="critical" name="Critical" fill="#DC2626" radius={[4, 4, 0, 0]} />
              <Bar dataKey="avg_svi" name="Avg SVI" fill="#64748B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Incident categories" subtitle="Top reported categories" testid="chart-categories">
          <div className="space-y-3 mt-2">
            {(data?.categories || []).map((c) => {
              const max = data.categories[0].count;
              return (
                <div key={c.category}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 capitalize">{c.category}</span>
                    <span className="font-mono text-white">{c.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-[#FF9933] rounded-full" style={{ width: `${(c.count / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
            {data && data.categories.length === 0 && <div className="text-sm text-slate-500">No data yet.</div>}
          </div>
        </Panel>
      </div>
    </OfficerShell>
  );
}

function Kpi({ label, value, icon: Icon, accent = "text-slate-300", testid }) {
  return (
    <Card className="p-5 rounded-2xl bg-slate-900 border-slate-800" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono uppercase tracking-wider text-slate-500">{label}</div>
        <Icon className={`h-4 w-4 ${accent}`} />
      </div>
      <div className="mt-3 font-display text-3xl font-bold text-white">{value ?? "—"}</div>
    </Card>
  );
}

function Panel({ title, subtitle, children, className = "", testid }) {
  return (
    <Card className={`p-5 rounded-2xl bg-slate-900 border-slate-800 ${className}`} data-testid={testid}>
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      <p className="text-xs text-slate-400 mb-3">{subtitle}</p>
      {children}
    </Card>
  );
}

import OfficerShell from "../components/OfficerShell";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "../components/ui/select";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { officerApi, riskColor, riskLabel } from "../lib/api";
import { Link } from "react-router-dom";

export default function OfficerCases() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [risk, setRisk] = useState("all");
  const [status, setStatus] = useState("all");

  const fetch = () => {
    const params = {};
    if (q) params.q = q;
    if (risk !== "all") params.risk = risk;
    if (status !== "all") params.status = status;
    officerApi.get("/cases", { params }).then((r) => setRows(r.data));
  };

  useEffect(fetch, [risk, status]);
  useEffect(() => {
    const t = setTimeout(fetch, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <OfficerShell>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-white">Case management</h1>
        <p className="text-slate-400 text-sm mt-1">Filter, search and triage cases from all channels.</p>
      </div>

      <Card className="p-4 rounded-2xl bg-slate-900 border-slate-800 mb-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search case ID, keyword or category…"
              data-testid="cases-search-input"
              className="pl-9 h-10 bg-slate-950 border-slate-700 text-white placeholder:text-slate-500"
            />
          </div>
          <Select value={risk} onValueChange={setRisk}>
            <SelectTrigger data-testid="filter-risk" className="!bg-slate-950 border-slate-700 !text-white">
              <SelectValue placeholder="Risk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risk levels</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger data-testid="filter-status" className="!bg-slate-950 border-slate-700 !text-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stats</SelectItem>
              <SelectItem value="awaiting_review">Awaiting review</SelectItem>
              <SelectItem value="under_review">Under review</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="rounded-2xl bg-slate-900 border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="cases-table">
            <thead className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3">Case</th>
                <th className="text-left px-5 py-3">Channel</th>
                <th className="text-left px-5 py-3">Category</th>
                <th className="text-right px-5 py-3">SVI</th>
                <th className="text-left px-5 py-3">Risk</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t border-slate-800 hover:bg-slate-800/40">
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
                  <td className="px-5 py-3 text-slate-400">{c.assigned_officer || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-500">No cases match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </OfficerShell>
  );
}

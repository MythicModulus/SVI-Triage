import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Brand, GovStrip } from "../components/Brand";
import { ShieldCheck, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "sonner";

export default function OfficerLogin() {
  const [officerId, setOfficerId] = useState("");
  const [password, setPassword] = useState("");
  const [demos, setDemos] = useState([]);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (localStorage.getItem("nhaa_officer_token")) nav("/officer/dashboard");
    api.get("/auth/demo-officers").then((r) => setDemos(r.data)).catch(() => {});
  }, [nav]);

  const submit = async (id, pw) => {
    setLoading(true);
    try {
      const r = await api.post("/auth/login", { officer_id: id ?? officerId, password: pw ?? password });
      localStorage.setItem("nhaa_officer_token", r.data.token);
      localStorage.setItem("nhaa_officer", JSON.stringify(r.data.officer));
      nav("/officer/dashboard");
    } catch (e) {
      toast.error("Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <GovStrip />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8"><Brand variant="dark" subtitle="Authority Portal" /></div>
          <Card className="p-7 sm:p-8 rounded-2xl bg-slate-900 border-slate-800 text-slate-100">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-400 mb-1">
              <ShieldCheck className="h-3.5 w-3.5" /> Authorised access only
            </div>
            <h1 className="font-display text-2xl font-semibold">Officer sign-in</h1>
            <p className="text-sm text-slate-400 mt-1">Enter your NHAA officer credentials.</p>

            <div className="mt-6 space-y-3">
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider">Officer ID</label>
                <Input
                  value={officerId} onChange={(e) => setOfficerId(e.target.value)}
                  placeholder="OFF-2001" data-testid="officer-id-input"
                  className="mt-1 bg-slate-950 border-slate-700 text-white placeholder:text-slate-600 h-11"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 uppercase tracking-wider">Password</label>
                <Input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="••••••••" data-testid="officer-password-input"
                  className="mt-1 bg-slate-950 border-slate-700 text-white placeholder:text-slate-600 h-11"
                />
              </div>
              <Button
                onClick={() => submit()} disabled={loading}
                data-testid="officer-login-submit-button"
                className="w-full h-11 bg-[#FF9933] hover:bg-[#E88622] text-slate-900 font-semibold"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </div>

            <div className="mt-7 pt-5 border-t border-slate-800">
              <div className="text-xs uppercase font-mono tracking-wider text-slate-500 mb-3">Demo accounts (hackathon)</div>
              <div className="grid gap-2">
                {demos.map((d) => (
                  <button
                    key={d.officer_id}
                    onClick={() => submit(d.officer_id, d.password)}
                    data-testid="officer-quick-demo-btn"
                    className="text-left px-3 py-2.5 rounded-lg bg-slate-950/50 border border-slate-800 hover:border-slate-600 transition-colors"
                  >
                    <div className="text-sm font-medium text-white">{d.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{d.officer_id} · {d.role}</div>
                  </button>
                ))}
              </div>
            </div>
          </Card>
          <div className="mt-6 text-center">
            <Link to="/" className="text-sm text-slate-400 hover:text-white">← Return to victim portal</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

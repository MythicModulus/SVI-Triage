import { Brand } from "./Brand";
import { Button } from "./ui/button";
import { LayoutDashboard, FolderKanban, LogOut, ShieldAlert, Volume2, VolumeX, BarChart3 } from "lucide-react";
import { Link, useLocation, useNavigate, Navigate } from "react-router-dom";
import { useState } from "react";
import { useCriticalAlerts } from "../hooks/useCriticalAlerts";

export default function OfficerShell({ children, onNewCritical }) {
  const loc = useLocation();
  const nav = useNavigate();
  const token = localStorage.getItem("nhaa_officer_token");
  const officer = JSON.parse(localStorage.getItem("nhaa_officer") || "null");
  const [muted, setMuted] = useState(localStorage.getItem("nhaa_alert_muted") === "1");
  useCriticalAlerts(onNewCritical);
  if (!token) return <Navigate to="/officer/login" replace />;

  const toggleMute = () => {
    const m = !muted;
    localStorage.setItem("nhaa_alert_muted", m ? "1" : "0");
    setMuted(m);
  };  


  const nav_items = [
    { to: "/officer/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/officer/cases", label: "Cases", icon: FolderKanban },
    { to: "/officer/analytics", label: "Analytics", icon: BarChart3 },
  ];

  const logout = () => {
    localStorage.removeItem("nhaa_officer_token");
    localStorage.removeItem("nhaa_officer");
    nav("/officer/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="p-5 border-b border-slate-800">
          <Brand variant="dark" subtitle="Authority Portal" />
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav_items.map((n) => {
            const active = loc.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to} to={n.to}
                data-testid={`nav-${n.label.toLowerCase()}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                }`}
              >
                <Icon className="h-4 w-4" /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 pb-3">
          <button
            onClick={toggleMute}
            data-testid="alert-mute-toggle"
            aria-pressed={muted}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs border transition-colors ${
              muted ? "border-amber-700/50 bg-amber-950/30 text-amber-300" : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
            }`}
          >
            <span className="flex items-center gap-2">
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
              Alert chime
            </span>
            <span className="font-mono uppercase tracking-wider">{muted ? "muted" : "on"}</span>
          </button>
        </div>
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
            <ShieldAlert className="h-3.5 w-3.5" /> Signed in as
          </div>
          <div className="text-sm font-semibold text-white">{officer?.name}</div>
          <div className="text-[11px] text-slate-400 mb-3 uppercase tracking-wider">{officer?.role}</div>
          <Button
            variant="outline" size="sm" onClick={logout}
            data-testid="logout-button"
            className="w-full bg-transparent border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden border-b border-slate-800 bg-slate-900/60 p-3 flex items-center justify-between">
          <Brand variant="dark" subtitle="Authority" />
          <Button size="sm" variant="outline" onClick={logout} className="bg-transparent border-slate-700 text-slate-200">
            <LogOut className="h-4 w-4" />
          </Button>
        </header>
        <main className="flex-1 p-4 sm:p-8 max-w-[1400px] w-full">{children}</main>
      </div>
    </div>
  );
}

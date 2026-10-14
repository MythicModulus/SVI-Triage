import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { officerApi } from "../lib/api";

const POLL_MS = 5000;

function chime() {
  if (localStorage.getItem("nhaa_alert_muted") === "1") return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t); o.stop(t + 0.4);
    });
  } catch {}
}

export function useCriticalAlerts(onNewCase) {
  const since = useRef(new Date().toISOString());
  const cb = useRef(onNewCase);
  cb.current = onNewCase;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await officerApi.get("/cases", { params: { risk: "critical", since: since.current, limit: 10 } });
        if (!alive || !r.data.length) return;
        since.current = r.data[0].created_at;
        chime();
        r.data.forEach((c) => {
          toast.error(`Critical case ${c.case_ref} · SVI ${c.svi_score}`, {
            id: c.id,
            duration: 15000,
            description: `${c.channel} · ${c.incident_category} — requires immediate human review`,
            action: { label: "Open case", onClick: () => (window.location.href = `/officer/cases/${c.case_ref}`) },
          });
        });
        cb.current?.(r.data);
      } catch {}
    };
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);
}

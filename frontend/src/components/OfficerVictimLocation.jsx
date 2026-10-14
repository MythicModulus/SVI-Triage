import { useEffect, useState } from "react";
import { AlertCircle, MapPin } from "lucide-react";
import { Card } from "./ui/card";
import { officerApi } from "../lib/api";

export default function OfficerVictimLocation({ caseId }) {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    officerApi.get(`/cases/${encodeURIComponent(caseId)}/location`)
      .then((response) => {
        if (active) setLocation(response.data);
      })
      .catch((requestError) => {
        if (!active) return;
        const detail = requestError?.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Location details could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [caseId]);

  return (
    <Card className="lg:col-span-3 p-6 rounded-2xl bg-slate-900 border-slate-800" aria-labelledby="officer-victim-location-title">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-slate-400" />
        <h2 id="officer-victim-location-title" className="font-display font-semibold text-white">Victim Location</h2>
      </div>

      {loading && <p role="status" className="mt-3 text-sm text-slate-400">Loading shared location…</p>}
      {error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {!loading && !error && location?.sharing_status === "not_shared" && (
        <p className="mt-3 text-sm text-slate-400">The victim has not shared a location for this case.</p>
      )}
      {!loading && !error && location?.sharing_status === "withdrawn" && (
        <div className="mt-3 text-sm text-amber-200">
          <p>Location sharing has been withdrawn. Precise location details are no longer available.</p>
          {location.deletion_requested && <p className="mt-1">A deletion request is pending review under applicable retention and legal requirements.</p>}
        </div>
      )}
      {!loading && !error && location?.sharing_status === "shared" && (
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {location.latitude != null && location.longitude != null && (
            <div className="sm:col-span-2">
              <div className="text-xs uppercase tracking-wider text-slate-500">Coordinates</div>
              <div className="mt-1 font-mono text-slate-100">
                Latitude {location.latitude}, longitude {location.longitude}
              </div>
            </div>
          )}
          {location.address && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Address or area</div>
              <div className="mt-1 text-slate-200">{location.address}</div>
            </div>
          )}
          {location.instructions && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Landmark / instructions</div>
              <div className="mt-1 text-slate-200">{location.instructions}</div>
            </div>
          )}
          {location.accuracy_m != null && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Reported accuracy</div>
              <div className="mt-1 text-slate-200">{Math.round(location.accuracy_m)} metres</div>
            </div>
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Source / status</div>
            <div className="mt-1 text-slate-200">{location.source === "gps" ? "GPS" : "Manual entry"} · Shared</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">Last submitted / updated</div>
            <div className="mt-1 text-slate-200">
              {location.updated_at ? new Date(location.updated_at).toLocaleString() : "Not available"}
            </div>
          </div>
          <p className="sm:col-span-2 border-t border-slate-800 pt-3 text-xs leading-relaxed text-slate-400">
            No external map is loaded to protect location privacy. Coordinates and reported accuracy are approximate and do not prove the victim is physically present at this location.
          </p>
        </div>
      )}
    </Card>
  );
}

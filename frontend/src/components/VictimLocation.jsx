import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Crosshair, MapPin, ShieldCheck } from "lucide-react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { victimApi } from "../lib/api";

function errorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
}

export default function VictimLocation({ caseId }) {
  const [location, setLocation] = useState(null);
  const [source, setSource] = useState("gps");
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [consent, setConsent] = useState(false);
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!caseId) {
      setError("The case reference is not available. Please reload this page.");
      setLoading(false);
      return () => { active = false; };
    }
    victimApi.get(`/victim/cases/${encodeURIComponent(caseId)}/location`)
      .then((response) => {
        if (!active) return;
        const saved = response.data.sharing_status === "not_shared" ? null : response.data;
        setLocation(saved);
        setEditing(!saved || saved.sharing_status === "not_shared");
      })
      .catch((requestError) => {
        if (active) setError(errorMessage(requestError, "We could not load location-sharing details. Please try again."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [caseId]);

  const useCurrentLocation = () => {
    setError("");
    setMessage("");
    if (!navigator.geolocation) {
      setSource("manual");
      setError("Location access is unavailable in this browser. You can enter an address manually.");
      return;
    }
    setRequesting(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLatitude(coords.latitude);
        setLongitude(coords.longitude);
        setAccuracy(Number.isFinite(coords.accuracy) ? coords.accuracy : null);
        setSource("gps");
        setRequesting(false);
      },
      (positionError) => {
        setSource("manual");
        setRequesting(false);
        setError(positionError.code === 1
          ? "Location permission was denied. You can enter an address manually instead."
          : "We could not determine your location. You can enter an address manually instead.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const chooseManual = () => {
    setSource("manual");
    setLatitude(null);
    setLongitude(null);
    setAccuracy(null);
    setError("");
    setMessage("");
  };

  const submit = async () => {
    setError("");
    setMessage("");
    if (!consent) {
      setError("Please confirm your consent before sharing this location.");
      return;
    }
    if (source === "gps" && (latitude === null || longitude === null)) {
      setError("Share your current location or choose manual entry before submitting.");
      return;
    }
    if (source === "manual" && !address.trim() && !instructions.trim()) {
      setError("Enter an address or nearby landmark before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await victimApi.post(
        `/victim/cases/${encodeURIComponent(caseId)}/location`,
        {
          source,
          latitude: source === "gps" ? latitude : null,
          longitude: source === "gps" ? longitude : null,
          accuracy_m: source === "gps" ? accuracy : null,
          address: address.trim() || null,
          instructions: instructions.trim() || null,
          consent: true,
        },
      );
      setLocation(response.data);
      setEditing(false);
      setConsent(false);
      setMessage("Your location was shared with authorized officers handling this case.");
    } catch (requestError) {
      setError(errorMessage(requestError, "We could not share your location. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const updateSharingStatus = async (action) => {
    setError("");
    setMessage("");
    setUpdatingStatus(true);
    try {
      const response = await victimApi.post(
        `/victim/cases/${encodeURIComponent(caseId)}/location/${action}`,
      );
      setLocation(response.data);
      setEditing(false);
      setMessage(action === "withdraw"
        ? "Location sharing is withdrawn. Officers will no longer see the location details."
        : "Your deletion request was recorded. The data will be retained or deleted according to applicable retention and legal requirements.");
    } catch (requestError) {
      setError(errorMessage(requestError, "We could not update location-sharing status. Please try again."));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const startEditing = () => {
    setSource(location?.source || "gps");
    setLatitude(location?.latitude ?? null);
    setLongitude(location?.longitude ?? null);
    setAccuracy(location?.accuracy_m ?? null);
    setAddress(location?.address || "");
    setInstructions(location?.instructions || "");
    setConsent(false);
    setEditing(true);
    setError("");
    setMessage("");
  };

  return (
    <Card className="p-5 sm:p-6 rounded-2xl border-slate-200 bg-white" aria-labelledby="victim-location-title">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-50 text-[#0F2C59] flex items-center justify-center shrink-0">
          <MapPin className="h-5 w-5" />
        </div>
        <div>
          <h2 id="victim-location-title" className="font-display text-xl font-semibold text-slate-900">Victim Location</h2>
          <p className="mt-1 text-sm text-slate-600">
            Sharing is optional. Your location is sent only after you review it and submit with consent.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" aria-live="assertive" className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      {message && (
        <div role="status" aria-live="polite" className="mt-4 flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> <span>{message}</span>
        </div>
      )}

      {loading ? (
        <div role="status" className="mt-5 text-sm text-slate-500">Loading location-sharing status…</div>
      ) : location?.sharing_status === "shared" && !editing ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-emerald-800">Sharing status: Shared</span>
            <span className="text-xs text-slate-500">Source: {location.source === "gps" ? "GPS" : "Manual entry"}</span>
          </div>
          {location.latitude != null && location.longitude != null && (
            <p className="mt-3 font-mono text-sm text-slate-800">
              Latitude {location.latitude}, longitude {location.longitude}
            </p>
          )}
          {location.accuracy_m != null && (
            <p className="mt-1 text-sm text-slate-600">Reported accuracy: {Math.round(location.accuracy_m)} metres</p>
          )}
          {location.address && <p className="mt-2 text-sm text-slate-700">{location.address}</p>}
          {location.instructions && <p className="mt-1 text-sm text-slate-600">Landmark/instructions: {location.instructions}</p>}
          <p className="mt-2 text-xs text-slate-500">
            Last submitted: {location.updated_at ? new Date(location.updated_at).toLocaleString() : "Not available"}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={startEditing} className="border-slate-300">
              Update location
            </Button>
            <Button type="button" variant="outline" disabled={updatingStatus} onClick={() => updateSharingStatus("withdraw")} className="border-slate-300">
              {updatingStatus ? "Updating…" : "Withdraw sharing"}
            </Button>
            <Button type="button" variant="outline" disabled={updatingStatus} onClick={() => updateSharingStatus("deletion-request")} className="border-red-200 text-red-700 hover:bg-red-50">
              Request deletion
            </Button>
          </div>
        </div>
      ) : location?.sharing_status === "withdrawn" && !editing ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Sharing status: Withdrawn</p>
          <p className="mt-1 text-sm text-amber-800">
            Officers can no longer see the location details. Stored data is handled according to applicable retention and legal requirements.
          </p>
          {location.deletion_requested && (
            <p className="mt-2 text-sm font-medium text-amber-900">A request to delete this location is pending review.</p>
          )}
          {!location.deletion_requested && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={startEditing} className="border-slate-300">
                Share a location again
              </Button>
              <Button type="button" variant="outline" disabled={updatingStatus} onClick={() => updateSharingStatus("deletion-request")} className="border-red-200 text-red-700 hover:bg-red-50">
                Request deletion
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {!location && (
            <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              You have not shared a location for this case. Nothing is sent to officers unless you choose to submit it.
            </p>
          )}
          {location?.sharing_status === "not_shared" && (
            <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              You have not shared a location for this case. Nothing is sent to officers unless you choose to submit it.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={useCurrentLocation} disabled={requesting} className="bg-[#0F2C59] hover:bg-[#1E3A8A] text-white">
              <Crosshair className="h-4 w-4 mr-2" />
              {requesting ? "Requesting location…" : "Share My Current Location"}
            </Button>
            <Button type="button" variant="outline" onClick={chooseManual} className="border-slate-300">
              Enter location manually
            </Button>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {source === "gps" && latitude != null && longitude != null && (
              <div className="sm:col-span-2 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm text-slate-700">
                <p className="font-medium">GPS location ready for your review</p>
                <p className="mt-1 font-mono">Latitude {latitude}, longitude {longitude}</p>
                {accuracy != null && <p className="mt-1">Reported accuracy: {Math.round(accuracy)} metres</p>}
              </div>
            )}
            <label className="text-sm font-medium text-slate-700">
              Address or area <span className="font-normal text-slate-500">(optional)</span>
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                maxLength={300}
                autoComplete="street-address"
                aria-label="Address or area"
                className="mt-1.5 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2C59]"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Nearby landmark or instructions <span className="font-normal text-slate-500">{source === "manual" ? "(provide this or an address)" : "(optional)"}</span>
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                maxLength={1000}
                rows={2}
                aria-label="Nearby landmark or instructions"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2C59]"
              />
            </label>
          </div>

          <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <div className="flex gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="h-4 w-4 mt-0.5 text-[#0F2C59] shrink-0" /> Review before sharing
            </div>
            <div className="mt-3 rounded-lg border border-blue-100 bg-white p-3 text-sm text-slate-700">
              <p><span className="font-medium">Source:</span> {source === "gps" ? "GPS" : "Manual entry"}</p>
              {latitude != null && longitude != null && (
                <p className="mt-1 font-mono">Latitude {latitude}, longitude {longitude}</p>
              )}
              {accuracy != null && <p className="mt-1">Reported accuracy: {Math.round(accuracy)} metres</p>}
              {address.trim() && <p className="mt-1">{address.trim()}</p>}
              {instructions.trim() && <p className="mt-1">Landmark/instructions: {instructions.trim()}</p>}
            </div>
            <p className="mt-2 text-sm text-slate-700">
              By submitting, you consent to sharing this location with authorized officers handling this case. Location access is voluntary; it is not collected continuously, and officers receive nothing until you submit.
            </p>
            <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 h-4 w-4 accent-[#0F2C59]"
              />
              <span>I have reviewed the location above and consent to sharing it with authorized officers handling my case.</span>
            </label>
            <Button type="button" onClick={submit} disabled={submitting || requesting} className="mt-4 bg-[#0F2C59] hover:bg-[#1E3A8A] text-white">
              {submitting ? "Submitting…" : "Confirm and share location"}
            </Button>
            {location && (
              <Button type="button" variant="ghost" onClick={() => setEditing(false)} className="mt-4 ml-2">
                Cancel
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

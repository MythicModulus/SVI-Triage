import { useEffect, useState } from "react";
import { AlertTriangle, Bot, MessageSquareText } from "lucide-react";
import { Card } from "./ui/card";
import { officerApi } from "../lib/api";

const FACT_LABELS = {
  incident_description: "Incident description",
  incident_datetime: "Approximate date or time",
  location: "Location",
  threats_or_safety_concerns: "Reported threats or safety concerns",
  relationship: "Relationship to alleged person",
};

export default function OfficerConversationReview({ caseId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    officerApi.get(`/cases/${encodeURIComponent(caseId)}/conversation`)
      .then((response) => {
        if (active) setData(response.data);
      })
      .catch((requestError) => {
        if (!active) return;
        const detail = requestError?.response?.data?.detail;
        setError(typeof detail === "string"
          ? detail
          : "Conversation review is available only to an authorized officer assigned to this case.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [caseId]);

  return (
    <Card className="lg:col-span-3 p-6 rounded-2xl bg-slate-900 border-slate-800" aria-labelledby="conversation-review-heading">
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-slate-400" />
        <h2 id="conversation-review-heading" className="font-display font-semibold text-white">Victim conversation review</h2>
      </div>
      {loading && <p role="status" className="mt-3 text-sm text-slate-400">Loading conversation…</p>}
      {error && <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>}
      {!loading && !error && data && (
        <div className="mt-4 space-y-5">
          {data.human_review_recommended && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Human review recommended. AI-generated safety indicators require officer judgment; they are not findings of fact.</span>
            </div>
          )}

          <section>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Bot className="h-4 w-4 text-slate-400" /> AI-generated summary
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
              {data.ai_generated_summary?.text || "No AI summary is available."}
            </p>
            {data.ai_generated_summary?.updated_at && (
              <p className="mt-1 text-xs text-slate-500">
                Updated {new Date(data.ai_generated_summary.updated_at).toLocaleString()} · Interpretation, not a verified fact
              </p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-white">Information explicitly provided by the victim</h3>
            {Object.keys(data.explicit_facts || {}).length === 0 ? (
              <p className="mt-2 text-sm text-slate-400">No details have been extracted with a source quote.</p>
            ) : (
              <dl className="mt-2 grid gap-3 sm:grid-cols-2">
                {Object.entries(data.explicit_facts).map(([field, fact]) => (
                  <div key={field} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <dt className="text-xs uppercase tracking-wider text-slate-500">{FACT_LABELS[field] || field}</dt>
                    <dd className="mt-1 text-sm text-slate-200">{fact.value}</dd>
                    <dd className="mt-2 text-xs text-slate-400">Victim quote: “{fact.evidence}”</dd>
                    {fact.updated_at && <dd className="mt-1 text-xs text-slate-500">Extracted {new Date(fact.updated_at).toLocaleString()}</dd>}
                  </div>
                ))}
              </dl>
            )}
            {data.unknown_fields?.length > 0 && (
              <p className="mt-3 text-xs text-slate-400">
                Not provided / unknown: {data.unknown_fields.map((field) => FACT_LABELS[field] || field).join(", ")}.
              </p>
            )}
            {data.fact_history?.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-slate-400">View corrected or superseded extracted details</summary>
                <ul className="mt-2 space-y-2">
                  {data.fact_history.map((fact, index) => (
                    <li key={`${fact.field}-${index}`} className="text-xs text-slate-400">
                      {FACT_LABELS[fact.field] || fact.field}: {fact.value} · source quote: “{fact.evidence}”
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          {data.potential_safety_concerns?.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-amber-200">Potential safety concerns · AI-supported flags</h3>
              <ul className="mt-2 space-y-2">
                {data.potential_safety_concerns.map((concern, index) => (
                  <li key={`${concern.source_message_id}-${index}`} className="rounded-lg border border-amber-900/70 bg-amber-950/20 p-3 text-sm text-slate-300">
                    <p>{concern.concern}</p>
                    <p className="mt-1 text-xs text-slate-400">Victim quote: “{concern.evidence}” · {concern.provenance}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-white">Original conversation</h3>
            {data.messages?.length ? (
              <ol className="mt-3 max-h-96 space-y-3 overflow-y-auto pr-1">
                {data.messages.map((message, index) => (
                  <li key={message.id || index} className={`rounded-lg p-3 ${message.role === "user" ? "bg-slate-800" : "bg-slate-950/60"}`}>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                      <span>{message.role === "user" ? "Victim" : "AI assistant"}</span>
                      <time>{message.ts ? new Date(message.ts).toLocaleString() : ""}</time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{message.text}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-slate-400">No saved chat messages are available for this case.</p>
            )}
          </section>
        </div>
      )}
    </Card>
  );
}

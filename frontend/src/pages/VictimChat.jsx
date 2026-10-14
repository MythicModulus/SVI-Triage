import VictimShell from "../components/VictimShell";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Send, ArrowRight, Bot, ShieldAlert } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ensureVictimSession, renewVictimSession, victimApi } from "../lib/api";
import { useLanguage } from "../lib/i18n";

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    throw new Error("The conversation history response was invalid.");
  }

  return messages.flatMap((message) => {
    if (!message || typeof message !== "object" || !["user", "assistant"].includes(message.role)) {
      return [];
    }
    if (typeof message.text !== "string" || !message.text.trim()) return [];

    return [{
      ...message,
      text: message.text,
      status: "sent",
    }];
  });
}

export default function VictimChat() {
  const { language, t: translate } = useLanguage();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [retryMessage, setRetryMessage] = useState(null);
  const scroller = useRef();
  const nav = useNavigate();

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await ensureVictimSession();
        let response;
        try {
          response = await victimApi.get("/chat/history");
        } catch (requestError) {
          if (requestError?.response?.status !== 401) throw requestError;
          await renewVictimSession();
          response = await victimApi.get("/chat/history");
        }
        if (active) {
          setMsgs(normalizeMessages(response.data?.messages));
        }
      } catch (requestError) {
        if (!active) return;
        const detail = requestError?.response?.data?.detail;
        setError(typeof detail === "string"
          ? detail
          : requestError instanceof Error && requestError.message.includes("history response")
            ? requestError.message
            : "The secure support conversation could not be loaded. Please try again.");
        setHistoryError(true);
      } finally {
        if (active) setHistoryLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const send = async (retry = null) => {
    const message = (retry?.text ?? text).trim();
    if (!message || sending || historyLoading || historyError) return;
    const pending = retry || {
      id: crypto.randomUUID(),
      client_message_id: crypto.randomUUID(),
      role: "user",
      text: message,
      status: "sending",
    };
    setError("");
    setSending(true);
    setRetryMessage(null);
    if (retry) {
      setMsgs((items) => items.map((item) => (
        item.client_message_id === retry.client_message_id
          ? { ...item, status: "sending" }
          : item
      )));
    } else {
      setMsgs((items) => [...items, pending]);
      setText("");
    }
    try {
      const response = await victimApi.post("/chat/message", {
        client_message_id: pending.client_message_id,
        message,
        language,
      });
      if (typeof response.data?.reply !== "string" || !response.data.reply.trim()) {
        throw new Error("invalid-chat-reply");
      }
      setMsgs((items) => [
        ...items.map((item) => (
          item.client_message_id === pending.client_message_id
            ? { ...item, status: "sent" }
            : item
        )),
        {
          id: response.data.client_message_id,
          role: "assistant",
          text: response.data.reply,
          ts: new Date().toISOString(),
          immediate_safety_concern: response.data.immediate_safety_concern,
          status: "sent",
        },
      ]);
      setDone(Boolean(response.data.done));
    } catch (requestError) {
      const detail = requestError?.response?.data?.detail;
      const messageText = Array.isArray(detail)
        ? detail.map((item) => item.msg).filter(Boolean).join("; ")
        : typeof detail === "string" ? detail : "";
      const failed = { ...pending, status: "error" };
      setMsgs((items) => {
        const existingIndex = items.findIndex((item) => item.client_message_id === pending.client_message_id);
        if (existingIndex < 0) return [...items, failed];
        return items.map((item, index) => index === existingIndex ? failed : item);
      });
      setRetryMessage(pending);
      setError(messageText || (
        requestError?.message === "invalid-chat-reply"
          ? "The support assistant returned an invalid response. Your message is saved here; please retry."
          : requestError?.response
          ? "We could not send your message. Please try again."
          : "The automated response service could not be reached. Your message is saved here; retry when the connection is restored."
      ));
    } finally {
      setSending(false);
    }
  };

  const continueToAssessment = () => {
    const narrative = msgs.filter((message) => message.role === "user").map((message) => message.text).join(" ");
    sessionStorage.setItem("nhaa_narrative", narrative);
    sessionStorage.setItem("nhaa_channel", "chat");
    sessionStorage.removeItem("nhaa_features");
    nav("/victim/assessment");
  };

  return (
    <VictimShell>
      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-4">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-500 mb-1">{translate("NHAA Support")}</div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">{translate("You can describe what happened in your own words.")}</h1>
          <div role="note" className="mt-3 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-sm text-slate-700">
            <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[#0F2C59]" />
            <span>You are chatting with an AI support assistant, not a human officer. You may skip any question. For human support, call <a href="tel:14566" className="font-semibold underline">14566</a>.</span>
          </div>
        </div>

        <Card className="rounded-2xl border-slate-200 bg-white overflow-hidden flex flex-col h-[70vh]">
          {error && (
            <div role="alert" data-testid="chat-error-message" className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div>{error}</div>
              {retryMessage && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => send(retryMessage)}
                  disabled={sending}
                  className="mt-2 h-9 border-red-300 bg-white text-red-800 hover:bg-red-100"
                  data-testid="chat-retry-button"
                >
                  {sending ? "Retrying…" : "Retry message"}
                </Button>
              )}
              {historyError && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => window.location.reload()}
                  className="mt-2 h-9 border-red-300 bg-white text-red-800 hover:bg-red-100"
                  data-testid="chat-history-retry-button"
                >
                  Reload conversation
                </Button>
              )}
            </div>
          )}
          <div ref={scroller} className="flex-1 overflow-y-auto p-5 space-y-4" data-testid="chat-message-list">
            {historyLoading && (
              <div role="status" className="text-center text-sm text-slate-500">Loading your conversation…</div>
            )}
            {!historyLoading && !historyError && msgs.length === 0 && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2.5 text-[15px] leading-relaxed text-slate-800">
                  Hello. You are safe here. Take your time — you can tell us what happened in your own words. What brings you to us today?
                </div>
              </div>
            )}
            {msgs.map((message, index) => (
              <div key={message.id || index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed ${
                  message.role === "user"
                    ? "bg-[#0F2C59] text-white rounded-br-sm"
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                }`} data-testid={`chat-message-${message.role}`}>
                  {message.text}
                  {message.status === "error" && <span className="mt-1 block text-xs text-red-200">Not sent · retry available above</span>}
                </div>
              </div>
            ))}
            {sending && (
              <div role="status" aria-label="AI assistant is responding" className="flex justify-start">
                <div className="bg-slate-100 rounded-2xl px-4 py-3 flex gap-1">
                  <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" />
                  <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.15s" }} />
                  <span className="h-1.5 w-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: "0.3s" }} />
                </div>
              </div>
            )}
          </div>

          {msgs.some((message) => message.role === "user") && !done && (
            <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-right">
              <Button
                type="button"
                variant="outline"
                onClick={continueToAssessment}
                disabled={sending}
                className="h-9 border-slate-300 bg-white text-[#0F2C59]"
                data-testid="chat-continue-assessment"
              >
                {translate("End chat & view assessment")} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
          {done ? (
            <div className="p-4 border-t border-slate-100 bg-emerald-50/60">
              <Button
                onClick={continueToAssessment} data-testid="chat-continue-assessment"
                className="w-full h-12 bg-[#0F2C59] hover:bg-[#1E3A8A] text-white"
              >
                {translate("End chat & view assessment")} <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          ) : (
            <div className="p-3 border-t border-slate-100 flex items-center gap-2">
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder={translate("Type your message…")}
                aria-label={translate("Type your message…")}
                data-testid="chat-input-field"
                disabled={historyLoading || historyError || sending}
                className="flex-1 h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0F2C59] focus:bg-white text-[15px]"
              />
              <Button
                onClick={() => send()} data-testid="chat-send-button"
                disabled={historyLoading || historyError || sending || !text.trim()}
                aria-label={translate("Send message")}
                className="h-11 w-11 p-0 bg-[#0F2C59] hover:bg-[#1E3A8A] text-white"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            <span>Messages are saved to this secure session for case review.</span>
            <a href="/victim/emergency" className="inline-flex items-center gap-1 font-medium text-red-700 hover:underline">
              <ShieldAlert className="h-3.5 w-3.5" /> Immediate help
            </a>
          </div>
        </Card>
      </section>
    </VictimShell>
  );
}

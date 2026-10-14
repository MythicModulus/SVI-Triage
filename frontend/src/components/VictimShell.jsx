import { Brand, GovStrip } from "./Brand";
import { Button } from "./ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./ui/select";
import { Check, Copy, Phone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useLanguage } from "../lib/i18n";

export default function VictimShell({ children }) {
  const nav = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const [copyStatus, setCopyStatus] = useState("");

  const copyHelpline = async (forCall = false) => {
    const successMessage = forCall
      ? "Calls can only be placed from a phone. 14566 copied—dial it from your phone."
      : "14566 copied. Dial it from your phone.";
    const failureMessage = forCall
      ? "This device cannot place calls. Please dial 14566 from your phone."
      : "Copy is unavailable here. Dial 14566 from your phone.";
    try {
      await navigator.clipboard.writeText("14566");
      setCopyStatus(t(successMessage));
    } catch {
      setCopyStatus(t(failureMessage));
    }
  };

  const handleCallClick = (event) => {
    const isPhone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    if (!isPhone) {
      event.preventDefault();
      copyHelpline(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <GovStrip t={t} />
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Brand subtitle={t("National Helpline Against Atrocities")} />
          <div className="flex items-center gap-2 sm:gap-3">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-[110px] h-9 text-sm" data-testid="language-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">हिन्दी</SelectItem>
                <SelectItem value="bn">বাংলা</SelectItem>
                <SelectItem value="mr">मराठी</SelectItem>
                <SelectItem value="ta">தமிழ்</SelectItem>
                <SelectItem value="te">తెలుగు</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm" variant="ghost"
              onClick={() => nav("/officer/login")}
              data-testid="officer-portal-link"
              className="hidden sm:inline-flex text-slate-600 hover:text-slate-900"
            >
              {t("Officer Portal")}
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>{t("Toll-free helpline ·")} <span className="font-mono text-slate-900 font-semibold">14566</span> {t("· Available 24 × 7")}</div>
          <div>{t("Confidential · Free · Handled by trained personnel")}</div>
        </div>
      </footer>
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        {copyStatus && (
          <div role="status" aria-live="polite" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-lg">
            {copyStatus}
          </div>
        )}
        <div className="flex items-center gap-2">
          <a
            href="tel:14566"
            data-testid="floating-call-14566"
            aria-label={t("Call helpline 14566 from your phone")}
            onClick={handleCallClick}
            className="rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg px-5 py-3 flex items-center gap-2 font-semibold"
          >
            <Phone className="h-4 w-4" /> {t("Call 14566")}
          </a>
          <button
            type="button"
            onClick={copyHelpline}
            data-testid="copy-helpline-14566"
            aria-label={t("Copy helpline number 14566")}
            className="rounded-full border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 shadow-lg p-3"
          >
            {copyStatus.startsWith(t("14566 copied")) ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

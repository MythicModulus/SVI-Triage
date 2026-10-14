import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export const Brand = ({ variant = "light", subtitle = "National Helpline Against Atrocities" }) => {
  const isDark = variant === "dark";
  return (
    <Link to="/" className="flex items-center gap-3" data-testid="brand-link">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${isDark ? "bg-white/10" : "bg-[#0F2C59]"}`}>
        <ShieldCheck className={`h-6 w-6 ${isDark ? "text-white" : "text-white"}`} strokeWidth={2.2} />
      </div>
      <div className="leading-tight">
        <div className={`font-display font-bold text-lg tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
          NHAA <span className="text-[#FF9933]">14566</span>
        </div>
        <div className={`text-[11px] font-medium ${isDark ? "text-slate-300" : "text-slate-500"}`}>{subtitle}</div>
      </div>
    </Link>
  );
};

export const GovStrip = ({ t = (text) => text }) => (
  <div className="w-full bg-slate-900 text-slate-200 text-[11px] py-1.5 px-4 flex items-center justify-between">
    <span className="uppercase tracking-wider font-medium">{t("Government of India · Ministry of Social Justice and Empowerment")}</span>
  </div>
);

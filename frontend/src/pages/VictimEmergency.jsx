import VictimShell from "../components/VictimShell";
import { Card } from "../components/ui/card";
import { Phone, ShieldAlert, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../lib/i18n";

export default function VictimEmergency() {
    const { t } = useLanguage();
    const emergencyNumbers = [
        [t("Police"), "112"],
        [t("Women Helpline"), "1091"],
        [t("Ambulance"), "108"],
        [t("Child Helpline"), "1098"],
    ];
    return (
        <VictimShell>
            <section className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold mb-4">
                    <ShieldAlert className="h-3.5 w-3.5" /> {t("Emergency Response")}
                </div>
                <h1 className="font-display text-3xl font-bold text-slate-900">{t("If you are in immediate danger")}</h1>
                <p className="mt-3 text-slate-600">
                    {t("Please contact one of the numbers below right now. A trained officer at NHAA can also stay on the line with you.")}
                </p>

                <Card className="mt-6 p-6 rounded-2xl border-red-200 bg-red-50">
                    <div className="text-xs font-mono uppercase tracking-wider text-red-700">{t("National Helpline Against Atrocities")}</div>
                    <div className="font-display text-5xl font-bold text-slate-900 mt-1">14566</div>
                    <a
                        href="tel:14566"
                        data-testid="emergency-call-14566"
                        aria-label={t("Call helpline 14566 from your phone")}
                        className="mt-4 inline-flex h-12 items-center rounded-md bg-red-600 px-4 text-base font-medium text-white hover:bg-red-700"
                    >
                            <Phone className="h-4 w-4 mr-2" /> {t("Call now")}
                    </a>
                    <p className="mt-2 text-sm text-red-900">
                        {t("On a computer, use the copy button at the bottom right and dial 14566 from your phone.")}
                    </p>
                </Card>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {emergencyNumbers.map(([n, num]) => (
                        <a key={n} href={`tel:${num}`} className="block">
                            <Card className="p-4 rounded-xl border-slate-200 bg-white hover:border-slate-300">
                                <div className="text-xs text-slate-500">{n}</div>
                                <div className="font-mono text-2xl font-bold text-slate-900">{num}</div>
                            </Card>
                        </a>
                    ))}
                </div>

                <Card className="mt-6 p-5 rounded-2xl border-slate-200 bg-white">
                    <div className="flex items-start gap-3">
                        <MapPin className="h-4 w-4 text-slate-500 mt-1" />
                        <div className="text-sm text-slate-700">
                            {t("If it is safe to do so, move to a public place or the home of a trusted person. Do not delete any messages or evidence. NHAA support is confidential.")}
                        </div>
                    </div>
                </Card>

                <div className="mt-6">
                    <Link to="/" className="text-sm text-slate-600 hover:text-slate-900">{t("← Back to home")}</Link>
                </div>
            </section>
        </VictimShell>
    );
}

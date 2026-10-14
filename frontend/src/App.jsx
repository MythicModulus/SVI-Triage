import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";

import VictimLanding from "@/pages/VictimLanding";
import VictimVoice from "@/pages/VictimVoice";
import VictimChat from "@/pages/VictimChat";
import VictimAssessment from "@/pages/VictimAssesment";
import VictimEmergency from "@/pages/VictimEmergency";
import OfficerLogin from "@/pages/OfficerLogin";
import OfficerDashboard from "@/pages/OfficerDashboard";
import OfficerCases from "@/pages/OfficerCases";
import OfficerAnalytics from "@/pages/OfficerAnalytics";
import OfficerCaseDetail from "@/pages/OfficerCaseDetail";
import { LanguageProvider } from "@/lib/i18n";

export default function App() {
  return (
    <div className="App">
      <LanguageProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<VictimLanding />} />
            <Route path="/victim" element={<Navigate to="/" replace />} />
            <Route path="/victim/voice" element={<VictimVoice />} />
            <Route path="/victim/chat" element={<VictimChat />} />
            <Route path="/victim/assessment" element={<VictimAssessment />} />
            <Route path="/victim/emergency" element={<VictimEmergency />} />

            <Route path="/officer/login" element={<OfficerLogin />} />
            <Route path="/officer/dashboard" element={<OfficerDashboard />} />
            <Route path="/officer/cases" element={<OfficerCases />} />
            <Route path="/officer/cases/:id" element={<OfficerCaseDetail />} />
            <Route path="/officer/analytics" element={<OfficerAnalytics />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </LanguageProvider>
      <Toaster richColors position="top-right" />
    </div>
  );
}

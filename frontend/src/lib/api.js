import axios from "axios";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:8000").replace(/\/+$/, "");
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

export const victimApi = axios.create({ baseURL: API });
victimApi.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("nhaa_victim_token");
  if (token) cfg.headers.Authorization = "Bearer " + token;
  return cfg;
});

export async function ensureVictimSession() {
  const sessionId = localStorage.getItem("nhaa_victim_session");
  const token = localStorage.getItem("nhaa_victim_token");
  if (sessionId && token) return sessionId;

  const response = await api.post("/auth/victim-session");
  localStorage.setItem("nhaa_victim_session", response.data.session_id);
  localStorage.setItem("nhaa_victim_token", response.data.session_token);
  return response.data.session_id;
}

export async function renewVictimSession() {
  localStorage.removeItem("nhaa_victim_session");
  localStorage.removeItem("nhaa_victim_token");
  return ensureVictimSession();
}

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("nhaa_officer_token");
  if (token && cfg.url && (cfg.url.startsWith("/cases") || cfg.url.startsWith("cases"))) {
    cfg.headers.Authorization = "Bearer " + token;
  }
  return cfg;
});

export const officerApi = axios.create({ baseURL: API });
officerApi.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("nhaa_officer_token");
  if (token) cfg.headers.Authorization = "Bearer " + token;
  return cfg;
});
officerApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadToken = localStorage.getItem("nhaa_officer_token");
      localStorage.removeItem("nhaa_officer_token");
      localStorage.removeItem("nhaa_officer");
      if (hadToken && window.location.pathname.startsWith("/officer/")) {
        window.location.assign("/officer/login");
      }
    }
    return Promise.reject(error);
  },
);

export const riskColor = (risk) => ({
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  moderate: "bg-yellow-500 text-slate-900",
  low: "bg-emerald-600 text-white",
}[risk] || "bg-slate-400 text-white");

export const riskLabel = (risk) => ({
  critical: "CRITICAL",
  high: "HIGH",
  moderate: "MODERATE",
  low: "LOW",
}[risk] || "—");

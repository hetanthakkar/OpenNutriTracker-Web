// Backend base URL. Override at build time with VITE_API_URL
// (e.g. https://paired-api.onrender.com). Defaults to the local Django dev server.
export const API_URL = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";

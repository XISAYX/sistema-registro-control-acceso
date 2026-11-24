import { getDeviceId, getStaffSession } from "./staff.js";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApiError";
    this.status = details.status || 0;
    this.data = details.data || null;
    this.timeout = Boolean(details.timeout);
    this.network = Boolean(details.network);
  }
}

export async function api(path, options = {}) {
  const { method = "GET", body, staff = false, timeout = 8000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (staff) {
    const session = getStaffSession();
    if (!session?.token) {
      clearTimeout(timer);
      throw new ApiError("No hay sesión de staff en este dispositivo.", {
        status: 401,
      });
    }
    headers["x-staff-token"] = session.token;
    headers["x-device-id"] = getDeviceId();
  }

  const url = path.startsWith("http")
    ? path
    : `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent("vg-auth-error"));
      }
      throw new ApiError(
        data.error || data.message || `Error ${response.status}`,
        {
          status: response.status,
          data,
        },
      );
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error?.name === "AbortError") {
      throw new ApiError("Tiempo de espera agotado.", {
        timeout: true,
        network: true,
      });
    }
    throw new ApiError("Sin respuesta del servidor.", { network: true });
  } finally {
    clearTimeout(timer);
  }
}

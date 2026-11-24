import { Component, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import Shell from "../components/Shell.jsx";
import StaffGate from "../components/StaffGate.jsx";
import BackupButtons from "../components/BackupButtons.jsx";
import { db } from "../db/localDb.js";
import * as apiModule from "../lib/api.js";
import * as staffModule from "../lib/staff.js";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8787";

class ValidarErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900">
          <h2 className="text-lg font-bold">Error al cargar el validador</h2>
          <p className="text-sm break-words">
            {this.state.error?.message ||
              "Ocurrió un error inesperado en la vista."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Recargar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function resolveStaffProfile() {
  const candidates = [
    staffModule.getStaffProfile,
    staffModule.getActiveStaff,
    staffModule.getCurrentStaff,
    staffModule.getStaffSession,
    staffModule.getStaff,
    staffModule.readStaffSession,
    staffModule.default,
  ];

  for (const fn of candidates) {
    if (typeof fn === "function") {
      try {
        const res = fn();
        if (res && typeof res === "object") return res;
      } catch {
        // Continúa probando el siguiente candidato
      }
    }
  }

  for (const key of [
    "staff_session",
    "staffProfile",
    "staff_profile",
    "staff",
    "activeStaff",
  ]) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch {
      // Continúa probando la siguiente clave
    }
  }

  return null;
}

async function resolveValidateRequest(code, validatorLabel, staff) {
  const payload = {
    qr_code: code,
    qrCode: code,
    code,
    validated_by: validatorLabel,
    validatedBy: validatorLabel,
    staff_slot: staff?.slot ?? staff?.staff_slot ?? null,
    staff_name: staff?.name ?? staff?.staff_name ?? null,
  };

  const fnCandidates = [
    apiModule.validateQr,
    apiModule.validateQR,
    apiModule.verifyQr,
    apiModule.verifyQR,
    apiModule.checkInQr,
    apiModule.checkIn,
    apiModule.postValidateQr,
  ];

  for (const fn of fnCandidates) {
    if (typeof fn === "function") {
      const result = await fn(payload);
      if (result && typeof result.json === "function") {
        return { ok: result.ok, data: await result.json() };
      }
      return { ok: true, data: result };
    }
  }

  const customFetch =
    apiModule.apiFetch ||
    apiModule.request ||
    apiModule.http ||
    apiModule.fetcher ||
    (typeof apiModule.default === "function" ? apiModule.default : null);

  if (typeof customFetch === "function") {
    const result = await customFetch("/api/validate-qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (result && typeof result.json === "function") {
      return { ok: result.ok, data: await result.json() };
    }
    return { ok: true, data: result };
  }

  const res = await fetch(`${API_BASE}/api/validate-qr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

function ValidarContent() {
  const [status, setStatus] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const lastScanRef = useRef({ code: "", time: 0 });
  const scannerRef = useRef(null);

  async function handleDecode(decodedText) {
    const code = decodedText.trim();
    if (!code) return;

    const now = Date.now();
    if (
      code === lastScanRef.current.code &&
      now - lastScanRef.current.time < 2500
    ) {
      return;
    }
    lastScanRef.current = { code, time: now };

    const staff = resolveStaffProfile();
    const validatorLabel = staff
      ? `${staff.slot || staff.role || "Staff"} - ${
          staff.name || staff.staff_name || "Validador"
        }`
      : "Staff Validador";

    let cached = null;
    try {
      cached = await db.attendeesCache.where("qr_code").equals(code).first();
    } catch {
      cached = null;
    }

    if (cached && cached.checked_in) {
      setStatus({
        type: "error",
        title: "ERROR: ESTE CÓDIGO QR YA FUE USADO",
        attendee: cached,
        detail: `Escaneado previamente por ${
          cached.validated_by || "otro staff"
        } (${
          cached.checked_in_at
            ? new Date(cached.checked_in_at).toLocaleTimeString()
            : "hora registrada"
        })`,
      });
      return;
    }

    try {
      const { ok, data } = await resolveValidateRequest(
        code,
        validatorLabel,
        staff,
      );

      if (!ok || data?.alreadyUsed) {
        if (data?.attendee && db?.attendeesCache) {
          await db.attendeesCache
            .put({ ...data.attendee, checked_in: true })
            .catch(() => {});
        }
        setStatus({
          type: "error",
          title: "ERROR: ESTE CÓDIGO QR YA FUE USADO",
          attendee: data?.attendee || cached,
          detail: data?.message || "Acceso denegado: boleto duplicado.",
        });
        return;
      }

      if (data?.attendee && db?.attendeesCache) {
        await db.attendeesCache
          .put({ ...data.attendee, checked_in: true })
          .catch(() => {});
      }

      setStatus({
        type: "success",
        title: "ACCESO VÁLIDO — BIENVENIDO",
        attendee: data?.attendee,
        detail: `Validado por ${validatorLabel}`,
      });
    } catch {
      if (cached) {
        const updated = {
          ...cached,
          checked_in: true,
          checked_in_at: new Date().toISOString(),
          validated_by: validatorLabel,
        };
        if (db?.attendeesCache) {
          await db.attendeesCache.put(updated).catch(() => {});
        }
        setStatus({
          type: "success",
          title: "ACCESO VÁLIDO (MODO OFFLINE)",
          attendee: updated,
          detail: `Guardado localmente por ${validatorLabel}`,
        });
      } else {
        setStatus({
          type: "error",
          title: "SIN CONEXIÓN / QR NO ENCONTRADO EN CACHÉ",
          detail: "Espera a que sincronice la red o verifica el código.",
        });
      }
    }
  }

  useEffect(() => {
    let active = true;
    const container = document.getElementById("qr-reader");
    if (!container) return undefined;

    const html5Qr = new Html5Qrcode("qr-reader");
    scannerRef.current = html5Qr;

    html5Qr
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          if (active) handleDecode(text);
        },
        () => {},
      )
      .then(() => {
        if (active) {
          setScanning(true);
          setCameraError("");
        }
      })
      .catch((err) => {
        if (active) {
          setScanning(false);
          setCameraError(
            err?.message ||
              "No se pudo iniciar la cámara. Verifica permisos o usa un dispositivo con cámara.",
          );
        }
      });

    return () => {
      active = false;
      if (html5Qr.isScanning) {
        html5Qr.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <Shell title="Validador de Acceso QR">
      <div className="space-y-4">
        <div
          id="qr-reader"
          className="min-h-[240px] w-full overflow-hidden rounded-xl border bg-black"
        />
        {!scanning && (
          <p className="text-sm text-amber-700">
            {cameraError ||
              "Permite el acceso a la cámara en tu navegador para escanear códigos QR."}
          </p>
        )}

        {status && (
          <div
            className={`rounded-2xl p-6 text-white shadow-lg ${
              status.type === "success" ? "bg-emerald-600" : "bg-red-600"
            }`}
          >
            <h2 className="text-2xl font-extrabold tracking-tight">
              {status.title}
            </h2>
            {status.attendee && (
              <div className="mt-3 space-y-1 text-base">
                <p className="font-bold">{status.attendee.full_name}</p>
                <p>Colonia: {status.attendee.colony}</p>
                <p>Tel: {status.attendee.phone}</p>
              </div>
            )}
            <p className="mt-3 text-sm opacity-95">{status.detail}</p>
          </div>
        )}

        <BackupButtons />
      </div>
    </Shell>
  );
}

export default function Validar() {
  return (
    <ValidarErrorBoundary>
      <StaffGate role="Validador">
        <ValidarContent />
      </StaffGate>
    </ValidarErrorBoundary>
  );
}

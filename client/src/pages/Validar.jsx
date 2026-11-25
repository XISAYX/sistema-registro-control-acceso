import { Component, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import Shell from "../components/Shell.jsx";
import StaffGate from "../components/StaffGate.jsx";
import BackupButtons from "../components/BackupButtons.jsx";
import { db } from "../db/localDb.js";
import { api } from "../lib/api.js";
import { getStaffSession } from "../lib/staff.js";

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

function formatHoraMx(isoString) {
  if (!isoString) return "hora registrada";
  try {
    return new Date(isoString).toLocaleString("es-MX", {
      timeZone: "America/Mexico_City",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return new Date(isoString).toLocaleTimeString();
  }
}

function ValidarContent() {
  const [status, setStatus] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cameraError, setCameraError] = useState("");

  // Mantiene fijado el último QR leído en pantalla hasta que entre un QR distinto
  // o el staff pulse "Volver a verificar este QR" / "Limpiar pantalla".
  const activeQrRef = useRef("");
  const inFlightRef = useRef(false);
  const scannerRef = useRef(null);

  async function processQr(rawCode, { forceRevalidate = false } = {}) {
    const code = String(rawCode || "")
      .trim()
      .toLowerCase();
    if (!code || inFlightRef.current) return;

    if (!forceRevalidate && code === activeQrRef.current) {
      return;
    }

    inFlightRef.current = true;
    activeQrRef.current = code;
    setProcessing(true);

    const session = getStaffSession();
    const staffSlot = session?.staff_slot || "Staff 1";
    const staffFullName = session?.staff_full_name || "Validador";
    const validatorLabel = session?.label || `${staffSlot} - ${staffFullName}`;

    let cached = null;
    try {
      cached = await db.attendeesCache.where("qr_code").equals(code).first();
    } catch {
      cached = null;
    }

    try {
      const data = await api("/api/validate-qr", {
        method: "POST",
        staff: true,
        body: {
          qr_code: code,
          staff_slot: staffSlot,
          staff_full_name: staffFullName,
          staff_role: "validador",
        },
      });

      const attendee = data?.attendee || cached;
      if (attendee && db?.attendeesCache) {
        await db.attendeesCache
          .put({
            ...attendee,
            checked_in: true,
            checked_in_at: data?.checked_in_at || attendee.checked_in_at,
            validated_by: data?.validated_by || attendee.validated_by,
          })
          .catch(() => {});
      }

      const who =
        data?.validated_by || attendee?.validated_by || validatorLabel;
      const when =
        data?.checked_in_at_mx ||
        formatHoraMx(data?.checked_in_at || attendee?.checked_in_at);

      setStatus({
        tone: "green",
        qrCode: code,
        title: data?.message || "ACCESO PERMITIDO",
        attendee,
        validatedBy: who,
        validatedAt: when,
        attempts: 1,
        detail: `Validado por ${who} · ${when}`,
      });
    } catch (err) {
      const payload = err?.data || err?.response || {};
      const attendee = payload?.attendee || cached;
      const statusCode = err?.status;

      if (statusCode === 409 || payload?.alreadyUsed) {
        const attempts = Number(payload?.attempts || 2);
        const tone =
          payload?.statusColor === "red" || attempts > 3 ? "red" : "yellow";
        const who =
          payload?.validated_by || attendee?.validated_by || "Otro staff";
        const when =
          payload?.checked_in_at_mx ||
          formatHoraMx(payload?.checked_in_at || attendee?.checked_in_at);

        if (attendee && db?.attendeesCache) {
          await db.attendeesCache
            .put({
              ...attendee,
              checked_in: true,
              checked_in_at: payload?.checked_in_at || attendee.checked_in_at,
              validated_by: who,
            })
            .catch(() => {});
        }

        setStatus({
          tone,
          qrCode: code,
          title:
            payload?.message ||
            (tone === "red"
              ? `ALERTA: MÁS DE 3 INTENTOS (${attempts} ESCANEOS)`
              : `ESTE CÓDIGO QR YA FUE VALIDADO (INTENTO ${attempts} DE 3)`),
          attendee,
          validatedBy: who,
          validatedAt: when,
          attempts,
          detail: `Validado por ${who} · ${when}`,
        });
        return;
      }

      if (err?.network && cached) {
        if (cached.checked_in) {
          const nextAttempts = (cached._local_attempts || 1) + 1;
          const tone = nextAttempts > 3 ? "red" : "yellow";
          const who = cached.validated_by || "Staff previo";
          const when = formatHoraMx(cached.checked_in_at);
          await db.attendeesCache
            .put({ ...cached, _local_attempts: nextAttempts })
            .catch(() => {});

          setStatus({
            tone,
            qrCode: code,
            title:
              tone === "red"
                ? `ALERTA OFFLINE: ${nextAttempts} INTENTOS`
                : `ESTE CÓDIGO QR YA FUE VALIDADO (INTENTO ${nextAttempts} DE 3)`,
            attendee: cached,
            validatedBy: who,
            validatedAt: when,
            attempts: nextAttempts,
            detail: `Validado por ${who} · ${when}`,
          });
        } else {
          const nowIso = new Date().toISOString();
          const updated = {
            ...cached,
            checked_in: true,
            checked_in_at: nowIso,
            validated_by: validatorLabel,
            _local_attempts: 1,
          };
          await db.attendeesCache.put(updated).catch(() => {});
          const when = formatHoraMx(nowIso);

          setStatus({
            tone: "green",
            qrCode: code,
            title: "ACCESO PERMITIDO (MODO OFFLINE)",
            attendee: updated,
            validatedBy: validatorLabel,
            validatedAt: when,
            attempts: 1,
            detail: `Validado por ${validatorLabel} · ${when}`,
          });
        }
        return;
      }

      setStatus({
        tone: "red",
        qrCode: code,
        title: "ERROR: CÓDIGO NO REGISTRADO",
        attendee: null,
        validatedBy: null,
        validatedAt: null,
        attempts: null,
        detail:
          payload?.message ||
          payload?.error ||
          err?.message ||
          "No se encontró este pase en el registro.",
      });
    } finally {
      inFlightRef.current = false;
      setProcessing(false);
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
          if (active) void processQr(text);
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

  const cardStyles =
    status?.tone === "green"
      ? "bg-emerald-600 text-white border-emerald-400"
      : status?.tone === "yellow"
        ? "bg-amber-400 text-zinc-950 border-amber-300"
        : "bg-red-600 text-white border-red-400";

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

        {processing && (
          <p className="rounded-xl bg-ink/10 px-4 py-2 text-center text-sm font-semibold">
            Verificando pase...
          </p>
        )}

        {status && (
          <div
            className={`rounded-2xl border-2 p-6 shadow-lg transition-colors ${cardStyles}`}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-2xl font-extrabold tracking-tight">
                {status.title}
              </h2>
              {status.attempts && (
                <span className="shrink-0 rounded-full bg-black/20 px-3 py-1 text-xs font-bold uppercase">
                  Escaneo #{status.attempts}
                </span>
              )}
            </div>

            {status.attendee && (
              <div className="mt-3 space-y-1 text-base">
                <p className="text-lg font-bold">{status.attendee.full_name}</p>
                <p>Colonia: {status.attendee.colony}</p>
                <p>Tel: {status.attendee.phone}</p>
              </div>
            )}

            <div className="mt-4 rounded-xl bg-black/15 p-3 text-sm font-medium">
              {status.validatedBy ? (
                <>
                  <p>
                    <strong>Validado por:</strong> {status.validatedBy}
                  </p>
                  <p>
                    <strong>Hora de validación:</strong> {status.validatedAt}
                  </p>
                </>
              ) : (
                <p>{status.detail}</p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={processing}
                onClick={() =>
                  void processQr(status.qrCode, { forceRevalidate: true })
                }
                className="rounded-xl bg-black/25 px-4 py-2.5 text-xs font-bold uppercase tracking-wide hover:bg-black/35 disabled:opacity-50"
              >
                Volver a verificar este QR
              </button>
              <button
                type="button"
                onClick={() => {
                  activeQrRef.current = "";
                  setStatus(null);
                }}
                className="rounded-xl bg-white/25 px-4 py-2.5 text-xs font-bold uppercase tracking-wide hover:bg-white/35"
              >
                Limpiar pantalla
              </button>
            </div>
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

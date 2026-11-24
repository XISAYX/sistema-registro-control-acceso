import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { STAFF_SLOTS, cleanName, nameError, staffLabel, staffSlotError } from "@shared/validate.js";
import Shell from "../components/Shell.jsx";
import { api } from "../lib/api.js";
import { clearStaffSession, getStaffSession, saveStaffSession } from "../lib/staff.js";
import { resumeStaffSync } from "../lib/sync.js";

export default function StaffAccess() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const existing = useMemo(() => getStaffSession(), []);
  const next = params.get("next") || "";
  const [token, setToken] = useState(existing?.token || "");
  const [fullName, setFullName] = useState(existing?.staff_full_name || "");
  const [slot, setSlot] = useState(existing?.staff_slot || "Staff 1");
  const [showToken, setShowToken] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function enter(role, path) {
    const staffFullName = cleanName(fullName);
    const formError = nameError(staffFullName) || staffSlotError(slot);
    if (formError) {
      setError(formError);
      return;
    }
    if (token.trim().length < 16) {
      setError("El token de staff debe tener al menos 16 caracteres.");
      return;
    }
    setBusy(true);
    setError("");
    const session = {
      token: token.trim(),
      staff_full_name: staffFullName,
      staff_slot: slot,
      staff_role: role,
      verified: true,
      label: staffLabel(slot, staffFullName),
    };
    const previous = getStaffSession();
    const sameVerified =
      previous?.verified &&
      previous.token === session.token &&
      previous.staff_full_name === session.staff_full_name &&
      previous.staff_slot === session.staff_slot;
    try {
      if (!(sameVerified && !navigator.onLine)) {
        saveStaffSession({ ...session, staff_role: role });
        await api("/api/staff/ping", { staff: true, timeout: 3000 });
      }
      saveStaffSession(session);
      resumeStaffSync();
      const destination = next === path || next === "/admin" ? next : path;
      navigate(destination, { replace: true });
    } catch (caught) {
      if (caught.network && sameVerified) {
        saveStaffSession(session);
        resumeStaffSync();
        navigate(path, { replace: true });
        return;
      }
      setError(caught.network ? "Sin red. Conéctate una vez para comprobar el token." : caught.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Identificación de staff">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const path = next === "/validar" ? "/validar" : next === "/admin" ? "/admin" : "/captura";
          const role = path === "/validar" ? "validador" : "capturista";
          void enter(role, path === "/admin" ? "/admin" : path);
        }}
      >
        <label className="grid gap-2 text-sm font-semibold">
          Token de acceso
          <span className="flex gap-2">
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              type={showToken ? "text" : "password"}
              autoComplete="off"
              className="h-14 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-lg font-normal"
            />
            <button
              type="button"
              onClick={() => setShowToken((value) => !value)}
              className="h-14 rounded-2xl border border-line bg-white px-4 text-sm font-semibold"
            >
              {showToken ? "Ocultar" : "Ver"}
            </button>
          </span>
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Tu nombre completo
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
            autoCapitalize="words"
            className="h-14 rounded-2xl border border-line bg-white px-4 text-lg font-normal"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Turno asignado
          <select
            value={slot}
            onChange={(event) => setSlot(event.target.value)}
            className="h-14 rounded-2xl border border-line bg-white px-4 text-lg font-normal"
          >
            {STAFF_SLOTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="rounded-2xl bg-[#3f0a16] px-4 py-3 text-white" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => enter("capturista", "/captura")}
          className="h-14 rounded-2xl bg-pine text-lg font-semibold text-white disabled:opacity-60"
        >
          Entrar a captura
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => enter("validador", "/validar")}
          className="h-14 rounded-2xl bg-ink text-lg font-semibold text-white disabled:opacity-60"
        >
          Entrar a validar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => enter(next === "/validar" ? "validador" : "capturista", "/admin")}
          className="h-14 rounded-2xl border border-ink/15 bg-white text-base font-semibold disabled:opacity-60"
        >
          Entrar al respaldo
        </button>
        {existing && (
          <button
            type="button"
            onClick={() => {
              clearStaffSession();
              setToken("");
              setFullName("");
            }}
            className="h-12 text-sm font-semibold text-ink/70"
          >
            Borrar la asignación de este teléfono
          </button>
        )}
      </form>
    </Shell>
  );
}

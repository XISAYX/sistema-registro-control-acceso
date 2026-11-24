import { useRef, useState } from "react";
import { cleanName, formatPhone, nameError, normalizePhone, phoneError, staffLabel } from "@shared/validate.js";
import BackupButtons from "../components/BackupButtons.jsx";
import ColonyField from "../components/ColonyField.jsx";
import Shell from "../components/Shell.jsx";
import { OTRA, resolveColony } from "../data/colonias.js";
import { COLONIAS } from "../data/colonias.js";
import { db } from "../db/localDb.js";
import { newClientId, newQrCode } from "../lib/ids.js";
import { getLastColony, getStaffSession, setLastColony } from "../lib/staff.js";
import { flushPendingQueue } from "../lib/sync.js";
import { useStaffSync } from "../lib/useStaffSync.js";

function initialColony() {
  const stored = getLastColony();
  if (stored.startsWith("Otra: ")) return { colony: OTRA, otra: stored.slice(6) };
  const known = COLONIAS.some((group) => group.items.includes(stored));
  return { colony: known ? stored : "", otra: "" };
}

export default function Captura() {
  useStaffSync();
  const session = getStaffSession();
  const start = initialColony();
  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [colony, setColony] = useState(start.colony);
  const [otra, setOtra] = useState(start.otra);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const saving = useRef(false);
  const nameRef = useRef(null);

  async function save(mode) {
    if (saving.current) return;
    const fullName = cleanName(name);
    const phone = normalizePhone(phoneRaw);
    const colonyResult = resolveColony(colony, otra);
    const formError = nameError(fullName) || phoneError(phone) || colonyResult.error;
    if (formError) {
      setError(formError);
      return;
    }
    const localPhone = await db.pendingRegistrations.where("phone").equals(phone).first();
    const cachedPhone = await db.attendeesCache.where("phone").equals(phone).first();
    if (localPhone || cachedPhone) {
      setError("Ese teléfono ya está en este dispositivo.");
      return;
    }
    saving.current = true;
    const record = {
      client_id: newClientId(),
      qr_code: newQrCode(),
      full_name: fullName,
      colony: colonyResult.value,
      phone,
      source: "live",
      staff_slot: session.staff_slot,
      staff_full_name: session.staff_full_name,
      staff_role: "capturista",
      created_at: new Date().toISOString(),
      status: "pending",
      error: "",
      attempts: 0,
    };
    const started = performance.now();
    try {
      await db.pendingRegistrations.add(record);
    } catch {
      setError("No se pudo guardar en este teléfono. Evita la navegación privada.");
      saving.current = false;
      return;
    }
    const elapsed = performance.now() - started;
    if (elapsed > 10) console.warn(`Escritura local de captura: ${elapsed.toFixed(1)} ms`);
    setSaved(fullName);
    setName("");
    setPhoneRaw("");
    setError("");
    if (mode === "pareja") {
      setLastColony(colonyResult.value);
    } else {
      setColony("");
      setOtra("");
      setLastColony("");
    }
    saving.current = false;
    nameRef.current?.focus();
    void flushPendingQueue();
  }

  const phone = normalizePhone(phoneRaw);

  return (
    <Shell title="Captura en sitio">
      <p className="mb-4 text-sm text-ink/70">
        Si la pareja ya trae QR, va a validación. Aquí cada persona queda ingresada al guardarla, con{" "}
        {staffLabel(session.staff_slot, session.staff_full_name)}.
      </p>
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save("pareja");
        }}
      >
        <label className="grid gap-2 text-sm font-semibold">
          Nombre completo
          <input
            ref={nameRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-14 rounded-2xl border border-line bg-white px-4 text-lg font-normal"
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Teléfono
          <input
            value={phoneRaw}
            onChange={(event) => setPhoneRaw(event.target.value)}
            className="h-14 rounded-2xl border border-line bg-white px-4 text-lg font-normal"
            inputMode="tel"
            autoComplete="tel"
            placeholder="10 dígitos"
          />
        </label>
        {phone && <p className="-mt-2 text-sm text-ink/60">Se guardará como {formatPhone(phone)}</p>}
        <ColonyField value={colony} onChange={setColony} otra={otra} onOtra={setOtra} />
        {error && (
          <p className="rounded-2xl bg-[#3f0a16] px-4 py-3 text-white" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-2xl bg-pine px-4 py-3 text-white" role="status">
            Guardado: {saved}
          </p>
        )}
        <button type="submit" className="h-16 rounded-2xl bg-pine text-lg font-semibold text-white">
          Guardar y registrar pareja
        </button>
        <button
          type="button"
          onClick={() => save("limpiar")}
          className="h-14 rounded-2xl border border-ink/15 bg-white text-base font-semibold"
        >
          Guardar y limpiar todo
        </button>
        <p className="text-sm text-ink/60">
          Primero queda en el teléfono y después se envía. La colonia se conserva para la pareja.
        </p>
      </form>
      <div className="mt-6">
        <BackupButtons />
      </div>
    </Shell>
  );
}

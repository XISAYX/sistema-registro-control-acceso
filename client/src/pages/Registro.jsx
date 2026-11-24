import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { QRCodeSVG } from "qrcode.react";
import { cleanName, formatPhone, nameError, normalizePhone, phoneError } from "@shared/validate.js";
import ColonyField from "../components/ColonyField.jsx";
import Shell from "../components/Shell.jsx";
import { resolveColony } from "../data/colonias.js";
import { db } from "../db/localDb.js";
import { flushPendingQueue } from "../lib/sync.js";
import { newClientId, newQrCode } from "../lib/ids.js";

export default function Registro() {
  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [colony, setColony] = useState("");
  const [otra, setOtra] = useState("");
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState(null);
  const saving = useRef(false);
  const live = useLiveQuery(
    () => (ticket ? db.pendingRegistrations.where("client_id").equals(ticket.client_id).first() : undefined),
    [ticket?.client_id],
  );

  async function onSubmit(event) {
    event.preventDefault();
    if (saving.current) return;
    const fullName = cleanName(name);
    const phone = normalizePhone(phoneRaw);
    const colonyResult = resolveColony(colony, otra);
    const formError = nameError(fullName) || phoneError(phone) || colonyResult.error;
    if (formError) {
      setError(formError);
      return;
    }
    saving.current = true;
    const record = {
      client_id: newClientId(),
      qr_code: newQrCode(),
      full_name: fullName,
      colony: colonyResult.value,
      phone,
      source: "preregistro",
      staff_slot: null,
      staff_full_name: null,
      staff_role: null,
      created_at: new Date().toISOString(),
      status: "pending",
      error: "",
      attempts: 0,
    };
    try {
      await db.pendingRegistrations.add(record);
    } catch {
      setError("No se pudo guardar en este teléfono. Evita la navegación privada.");
      saving.current = false;
      return;
    }
    setTicket(record);
    setError("");
    saving.current = false;
    void flushPendingQueue();
  }

  function downloadQr() {
    const svg = document.querySelector("#qr-pass svg");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const image = new Image();
    const blobUrl = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 800;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, 800, 800);
      context.drawImage(image, 40, 40, 720, 720);
      URL.revokeObjectURL(blobUrl);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "qr-actopan.png";
        link.click();
        URL.revokeObjectURL(url);
      });
    };
    image.src = blobUrl;
  }

  if (ticket) {
    const status = live?.status || ticket.status;
    const conflict = status === "conflict";
    return (
      <Shell title="Tu código QR">
        <div className="rounded-[2rem] bg-card p-5 text-center ring-1 ring-line">
          <p className="text-sm font-semibold tracking-wide text-gold">ENTRADA DE UN SOLO USO</p>
          <h1 className="mt-2 text-3xl font-semibold">{ticket.full_name}</h1>
          <p className="mt-1 text-ink/70">
            {ticket.colony} · {formatPhone(ticket.phone)}
          </p>
          {conflict ? (
            <p className="mt-5 rounded-2xl bg-[#3f0a16] px-4 py-4 text-left text-white" role="alert">
              Ese teléfono ya está registrado. Este código no da acceso. Usa el QR del primer registro o corrige el número.
            </p>
          ) : (
            <>
              <div id="qr-pass" className="mx-auto mt-5 w-fit rounded-3xl bg-white p-3">
                <QRCodeSVG value={ticket.qr_code} size={260} level="H" includeMargin bgColor="#ffffff" fgColor="#17211b" />
              </div>
              <p className="mt-3 break-all font-mono text-xs text-ink/60">{ticket.qr_code}</p>
              <p className="mt-4 text-left text-base" role="status">
                {status === "synced"
                  ? "Listo. El código ya está en el servidor. Toma una captura o guarda la imagen."
                  : "Guardado en este teléfono. Si aún no dice que llegó al servidor, no cierres la página o ábrela otra vez con red."}
              </p>
              <button type="button" onClick={downloadQr} className="mt-4 h-14 w-full rounded-2xl bg-pine text-lg font-semibold text-white">
                Guardar imagen del QR
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setTicket(null)}
            className="mt-3 h-12 w-full rounded-2xl text-base font-semibold text-pine"
          >
            Registrar a otra persona
          </button>
          <Link to="/" className="mt-1 inline-block text-sm text-ink/60 underline">
            Volver al inicio
          </Link>
        </div>
      </Shell>
    );
  }

  const phone = normalizePhone(phoneRaw);

  return (
    <Shell title="Registro público">
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <label className="grid gap-2 text-sm font-semibold">
          Nombre completo
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-14 rounded-2xl border border-line bg-white px-4 text-lg font-normal"
            autoComplete="name"
            autoCapitalize="words"
            required
          />
        </label>
        <ColonyField value={colony} onChange={setColony} otra={otra} onOtra={setOtra} />
        <label className="grid gap-2 text-sm font-semibold">
          Teléfono
          <input
            value={phoneRaw}
            onChange={(event) => setPhoneRaw(event.target.value)}
            className="h-14 rounded-2xl border border-line bg-white px-4 text-lg font-normal"
            inputMode="tel"
            autoComplete="tel"
            placeholder="10 dígitos"
            required
          />
        </label>
        {phone && <p className="text-sm text-ink/60">Se guardará como {formatPhone(phone)}</p>}
        {error && (
          <p className="rounded-2xl bg-[#3f0a16] px-4 py-3 text-white" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="h-14 rounded-2xl bg-pine text-lg font-semibold text-white">
          Generar mi QR
        </button>
        <p className="text-sm text-ink/60">El teléfono se usa solo para identificar tu registro en este evento.</p>
      </form>
    </Shell>
  );
}

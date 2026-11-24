import { useState } from "react";
import { downloadLocalBackup } from "../lib/backup.js";

export default function BackupButtons() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    setMessage("");
    try {
      await downloadLocalBackup();
      setMessage("Se descargaron el JSON y el CSV de este teléfono.");
    } catch (error) {
      setMessage(error.message || "No se pudo crear el respaldo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="h-14 rounded-2xl border border-ink/15 bg-white text-base font-semibold disabled:opacity-60"
      >
        {busy ? "Preparando respaldo…" : "Descargar respaldo JSON y CSV"}
      </button>
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}

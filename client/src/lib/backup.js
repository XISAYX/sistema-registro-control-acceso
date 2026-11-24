import { formatMx, formatPhone } from "@shared/validate.js";
import { db } from "../db/localDb.js";
import { getStaffSession } from "./staff.js";

function stamp() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(/[: ]/g, "");
  return parts.replace(",", "-");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function buildBackup() {
  const session = getStaffSession();
  const [pendingRegistrations, attendeesCache, uncertainScans] = await Promise.all([
    db.pendingRegistrations.toArray(),
    db.attendeesCache.toArray(),
    db.uncertainScans.toArray(),
  ]);
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    staff_slot: session?.staff_slot || "",
    staff_full_name: session?.staff_full_name || "",
    staff_role: session?.staff_role || "",
    pendingRegistrations,
    attendeesCache,
    uncertainScans,
  };
}

export async function downloadLocalBackup() {
  const payload = await buildBackup();
  const name = `respaldo-actopan-${stamp()}`;
  downloadBlob(
    `${name}.json`,
    new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
  );
  const header = [
    "Tipo",
    "Estado",
    "Nombre completo",
    "Colonia o localidad",
    "Teléfono",
    "Origen",
    "Ingresó",
    "Hora",
    "Staff Asignado (Staff 1-5)",
    "Nombre del Encargado",
    "Código QR",
    "ID de registro",
    "Error",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const row of payload.pendingRegistrations) {
    lines.push(
      [
        "cola",
        row.status,
        row.full_name,
        row.colony,
        row.phone,
        row.source,
        row.source === "live" ? "Sí" : "",
        formatMx(row.created_at),
        row.staff_slot || "",
        row.staff_full_name || "",
        row.qr_code,
        row.client_id,
        row.error || "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  for (const row of payload.attendeesCache) {
    lines.push(
      [
        "copia",
        row.checked_in ? "ingresó" : "sin ingreso",
        row.full_name,
        row.colony,
        formatPhone(row.phone),
        row.source,
        row.checked_in ? "Sí" : "No",
        formatMx(row.checked_in_at || row.created_at),
        row.staff_slot || "",
        row.staff_full_name || "",
        row.qr_code,
        row.client_id,
        "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  await new Promise((resolve) => window.setTimeout(resolve, 400));
  downloadBlob(
    `${name}.csv`,
    new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }),
  );
}

export async function restoreBackup(file) {
  const payload = JSON.parse(await file.text());
  if (payload?.version !== 1 || !Array.isArray(payload.pendingRegistrations)) {
    throw new Error("Ese archivo no es un respaldo de Registro Actopan.");
  }
  let restored = 0;
  for (const row of payload.pendingRegistrations) {
    if (!row?.client_id || !row?.qr_code || !row?.full_name) continue;
    const exists = await db.pendingRegistrations.where("client_id").equals(row.client_id).first();
    if (exists) continue;
    const status = row.status === "conflict" ? "conflict" : "pending";
    const { localId, ...rest } = row;
    try {
      await db.pendingRegistrations.add({ ...rest, status, error: row.error || "" });
      restored += 1;
    } catch {
      // Another local row already uses this QR or client id.
    }
  }
  if (Array.isArray(payload.attendeesCache) && payload.attendeesCache.length) {
    const rows = payload.attendeesCache.filter((row) => row?.qr_code);
    await db.attendeesCache.bulkPut(rows);
  }
  if (Array.isArray(payload.uncertainScans)) {
    const rows = payload.uncertainScans.filter((row) => row?.qr_code);
    if (rows.length) await db.uncertainScans.bulkPut(rows);
  }
  return restored;
}

export async function downloadExcel() {
  const { getStaffSession: readSession } = await import("./staff.js");
  const session = readSession();
  if (!session?.token) throw new Error("No hay sesión de staff.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch("/api/export-excel", {
      headers: {
        "x-staff-token": session.token,
        "x-device-id": (await import("./staff.js")).getDeviceId(),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "No se pudo descargar el Excel.");
    }
    const blob = await response.blob();
    downloadBlob("asistentes_actopan.xlsx", blob);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("El Excel tardó demasiado.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

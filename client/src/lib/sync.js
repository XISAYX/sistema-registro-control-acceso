import { staffLabel } from "@shared/validate.js";
import { db } from "../db/localDb.js";
import { api } from "./api.js";
import { getStaffSession } from "./staff.js";

let chain = Promise.resolve();
let staffPaused = false;

export function resumeStaffSync() {
  staffPaused = false;
}

export function flushPendingQueue() {
  const run = chain.then(() => flushOnce(), () => flushOnce());
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function startAutoFlush() {
  const tick = () => {
    if (navigator.onLine) void flushPendingQueue();
  };
  window.setInterval(tick, 5000);
  window.addEventListener("online", tick);
}

async function flushOnce() {
  await db.pendingRegistrations.where("status").equals("syncing").modify({ status: "pending" });
  await flushPreregistros();
  await flushLive();
}

function registrationBody(row, sessionFallback) {
  return {
    client_id: row.client_id,
    full_name: row.full_name,
    colony: row.colony,
    phone: row.phone,
    qr_code: row.qr_code,
    created_at: row.created_at,
    staff_slot: row.staff_slot || sessionFallback?.staff_slot,
    staff_full_name: row.staff_full_name || sessionFallback?.staff_full_name,
    staff_role: "capturista",
  };
}

async function flushPreregistros() {
  const rows = await db.pendingRegistrations
    .where("status")
    .equals("pending")
    .filter((row) => row.source === "preregistro")
    .toArray();

  for (const row of rows) {
    await db.pendingRegistrations.update(row.localId, { status: "syncing" });
    try {
      await api("/api/register", {
        method: "POST",
        timeout: 2500,
        body: registrationBody(row),
      });
      await db.pendingRegistrations.update(row.localId, { status: "synced", error: "" });
    } catch (error) {
      const conflict = error.status === 409;
      await db.pendingRegistrations.update(row.localId, {
        status: conflict ? "conflict" : "pending",
        error: error.message,
        attempts: (row.attempts || 0) + 1,
      });
    }
  }
}

async function flushLive() {
  const session = getStaffSession();
  if (!session || session.staff_role !== "capturista" || staffPaused) return;

  const rows = await db.pendingRegistrations
    .where("status")
    .equals("pending")
    .filter((row) => row.source === "live")
    .toArray();

  for (let index = 0; index < rows.length; index += 40) {
    const chunk = rows.slice(index, index + 40);
    await Promise.all(
      chunk.map((row) => db.pendingRegistrations.update(row.localId, { status: "syncing" })),
    );
    try {
      const data = await api("/api/sync-batch", {
        method: "POST",
        staff: true,
        timeout: 3000,
        body: { registrations: chunk.map((row) => registrationBody(row, session)) },
      });
      for (const result of data.results || []) {
        const local = chunk.find((row) => row.client_id === result.client_id);
        if (!local) continue;
        if (result.ok) {
          await db.pendingRegistrations.update(local.localId, { status: "synced", error: "" });
          if (result.inserted !== false) {
            await db.attendeesCache.put({
              qr_code: local.qr_code,
              client_id: local.client_id,
              full_name: local.full_name,
              colony: local.colony,
              phone: local.phone,
              source: "live",
              checked_in: true,
              checked_in_at: local.created_at,
              validated_by: staffLabel(local.staff_slot, local.staff_full_name),
              staff_slot: local.staff_slot,
              staff_full_name: local.staff_full_name,
              staff_role: "capturista",
              updated_at: local.created_at,
            });
          }
        } else {
          await db.pendingRegistrations.update(local.localId, {
            status: "conflict",
            error: result.error || "No se pudo enviar.",
          });
        }
      }
    } catch (error) {
      if (error.status === 401) staffPaused = true;
      await Promise.all(
        chunk.map((row) =>
          db.pendingRegistrations.update(row.localId, {
            status: "pending",
            error: error.message,
            attempts: (row.attempts || 0) + 1,
          }),
        ),
      );
      if (error.status === 401) return;
    }
  }
}

export async function syncAttendeesCache() {
  const session = getStaffSession();
  if (!session || staffPaused || !navigator.onLine) return { ok: false };

  let cursorAt = (await db.meta.get("cache_cursor_at"))?.value || "";
  let cursorId = (await db.meta.get("cache_cursor_id"))?.value || "";
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ limit: "1000" });
    if (cursorAt && cursorId) {
      params.set("cursor_at", cursorAt);
      params.set("cursor_id", cursorId);
    }
    let data;
    try {
      data = await api(`/api/attendees-cache?${params.toString()}`, {
        staff: true,
        timeout: 3000,
      });
    } catch (error) {
      if (error.status === 401) staffPaused = true;
      throw error;
    }
    const rows = data.attendees || [];
    if (rows.length) {
      await db.attendeesCache.bulkPut(rows);
      const last = rows[rows.length - 1];
      cursorAt = last.updated_at;
      cursorId = last.id;
      await db.meta.bulkPut([
        { key: "cache_cursor_at", value: cursorAt },
        { key: "cache_cursor_id", value: cursorId },
      ]);
    }
    if (!data.has_more) break;
  }
  await db.meta.put({ key: "cache_synced_at", value: new Date().toISOString() });
  return { ok: true };
}

export async function resetAttendeeCache() {
  await db.attendeesCache.clear();
  await db.meta.bulkDelete(["cache_cursor_at", "cache_cursor_id", "cache_synced_at"]);
  return syncAttendeesCache();
}

import Dexie from "dexie";

export const db = new Dexie("registro_actopan");

db.version(1).stores({
  pendingRegistrations: "++localId, &client_id, &qr_code, phone, status, source, created_at",
  attendeesCache: "qr_code, client_id, phone, checked_in, updated_at",
  uncertainScans: "qr_code, at",
  meta: "key",
});

export async function countByStatus(status) {
  return db.pendingRegistrations.where("status").equals(status).count();
}

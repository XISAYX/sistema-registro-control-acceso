import { STAFF_ROLES, STAFF_SLOTS } from "@shared/validate.js";

const SESSION_KEY = "vg.staff.session.v1";
const DEVICE_KEY = "vg.device.id";
const COLONY_KEY = "vg.last.colony";

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getStaffSession() {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!data?.token || !data.staff_full_name) return null;
    if (!STAFF_SLOTS.includes(data.staff_slot)) return null;
    if (!STAFF_ROLES.includes(data.staff_role)) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveStaffSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStaffSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getLastColony() {
  return localStorage.getItem(COLONY_KEY) || "";
}

export function setLastColony(value) {
  if (!value) localStorage.removeItem(COLONY_KEY);
  else localStorage.setItem(COLONY_KEY, value);
}

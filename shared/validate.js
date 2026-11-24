export const STAFF_SLOTS = ["Staff 1", "Staff 2", "Staff 3", "Staff 4", "Staff 5"];
export const STAFF_ROLES = ["capturista", "validador"];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QR_RE =
  /^act-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function cleanName(input) {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameError(name) {
  if (name.length < 3 || name.length > 120) {
    return "Escribe el nombre completo.";
  }
  if (!/^[\p{L}][\p{L}\s'.’-]*$/u.test(name)) {
    return "El nombre solo puede tener letras, espacios, apóstrofos o guiones.";
  }
  return null;
}

export function cleanColony(input) {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function colonyError(colony) {
  if (colony.length < 2 || colony.length > 140) {
    return "Selecciona o escribe la colonia o localidad.";
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N}\s.'’#,:-]*$/u.test(colony)) {
    return "Revisa el nombre de la colonia o localidad.";
  }
  return null;
}

export function normalizePhone(input) {
  let digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("521")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("52")) digits = digits.slice(2);
  return digits;
}

export function phoneError(phone) {
  if (!/^[1-9]\d{9}$/.test(phone)) {
    return "El teléfono debe tener 10 dígitos de México. Si pegas +52, se quita solo; no dejes un dígito de más.";
  }
  if (/^(\d)\1{9}$/.test(phone)) {
    return "Ese teléfono no es válido.";
  }
  return null;
}

export function normalizeQr(input) {
  return String(input ?? "").trim().toLowerCase();
}

export function qrError(qr) {
  if (!QR_RE.test(qr)) return "El código QR no pertenece a este evento.";
  return null;
}

export function clientIdError(id) {
  if (!UUID_RE.test(String(id ?? "").trim())) {
    return "El identificador del registro no es válido.";
  }
  return null;
}

export function staffSlotError(slot) {
  if (!STAFF_SLOTS.includes(slot)) return "Selecciona un turno del Staff 1 al Staff 5.";
  return null;
}

export function staffRoleError(role) {
  if (!STAFF_ROLES.includes(role)) return "Selecciona la función: capturista o validador.";
  return null;
}

export function staffLabel(slot, fullName) {
  return `${slot} - ${fullName}`;
}

export function roleLabel(role) {
  if (role === "capturista") return "Capturista";
  if (role === "validador") return "Validador";
  return "";
}

export function coerceClientTime(input, now = Date.now()) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return new Date(now);
  if (date.getTime() > now + 5 * 60 * 1000) return new Date(now);
  if (date.getTime() < now - 7 * 24 * 60 * 60 * 1000) return new Date(now);
  return date;
}

export function formatMx(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatPhone(phone) {
  const digits = String(phone ?? "");
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

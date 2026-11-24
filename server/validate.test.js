import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanName,
  clientIdError,
  coerceClientTime,
  colonyError,
  nameError,
  normalizePhone,
  normalizeQr,
  phoneError,
  qrError,
  staffLabel,
  staffSlotError,
} from "../shared/validate.js";

test("normaliza teléfonos de México a 10 dígitos", () => {
  assert.equal(normalizePhone("+52 772 123 4567"), "7721234567");
  assert.equal(normalizePhone("5217721234567"), "7721234567");
  assert.equal(normalizePhone("(772) 123-4567"), "7721234567");
  assert.equal(phoneError("7721234567"), null);
  assert.ok(phoneError("771234567"));
  assert.ok(phoneError("0772123456"));
  assert.ok(phoneError("1111111111"));
  assert.ok(phoneError("77212345678"));
});

test("acepta nombres con acentos y rechaza basura", () => {
  assert.equal(cleanName("  María   José  "), "María José");
  assert.equal(nameError("María José López"), null);
  assert.equal(nameError("Ana-Luisa O'Connor"), null);
  assert.ok(nameError("A"));
  assert.ok(nameError("12345"));
});

test("valida colonia, qr, staff y hora del dispositivo", () => {
  assert.equal(colonyError("La Peña"), null);
  assert.equal(colonyError("Otra: El Boxtha"), null);
  assert.ok(colonyError(" "));
  const id = "3f1c2c4e-8b2a-4e5d-9c1a-6b7d8e9f0a1b";
  assert.equal(clientIdError(id), null);
  assert.equal(qrError(normalizeQr(`ACT-${id}`)), null);
  assert.ok(qrError("https://example.com"));
  assert.equal(staffSlotError("Staff 5"), null);
  assert.ok(staffSlotError("Staff 9"));
  assert.equal(staffLabel("Staff 2", "Juan Pérez"), "Staff 2 - Juan Pérez");

  const now = Date.parse("2026-04-18T18:00:00.000Z");
  assert.equal(coerceClientTime("2026-04-18T17:50:00.000Z", now).toISOString(), "2026-04-18T17:50:00.000Z");
  assert.equal(coerceClientTime("2010-01-01T00:00:00.000Z", now).toISOString(), "2026-04-18T18:00:00.000Z");
  assert.equal(coerceClientTime("not-a-date", now).toISOString(), "2026-04-18T18:00:00.000Z");
});

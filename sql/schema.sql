-- Registro Actopan
-- Listo para una base vacía en Supabase, Neon o Railway (PostgreSQL 14+).
-- Las horas se guardan en UTC (timestamptz) y la app las muestra en America/Mexico_City.
-- Vuelve a ejecutar este archivo solo en una base nueva: CREATE TABLE IF NOT EXISTS
-- no altera tablas que ya existían con otra forma.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  colony TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  qr_code TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  checked_in BOOLEAN NOT NULL DEFAULT FALSE,
  checked_in_at TIMESTAMPTZ,
  validated_by TEXT,
  staff_slot TEXT,
  staff_full_name TEXT,
  staff_role TEXT,
  registered_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT attendees_source_chk CHECK (source IN ('preregistro', 'live')),
  CONSTRAINT attendees_phone_chk CHECK (phone ~ '^[1-9][0-9]{9}$'),
  CONSTRAINT attendees_qr_chk CHECK (
    qr_code ~ '^act-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  CONSTRAINT attendees_name_len_chk CHECK (char_length(full_name) BETWEEN 3 AND 120),
  CONSTRAINT attendees_colony_len_chk CHECK (char_length(colony) BETWEEN 2 AND 140),
  CONSTRAINT attendees_staff_slot_chk CHECK (
    staff_slot IS NULL OR staff_slot IN ('Staff 1', 'Staff 2', 'Staff 3', 'Staff 4', 'Staff 5')
  ),
  CONSTRAINT attendees_staff_role_chk CHECK (
    staff_role IS NULL OR staff_role IN ('capturista', 'validador')
  ),
  CONSTRAINT attendees_checkin_pair_chk CHECK (
    (checked_in = FALSE AND checked_in_at IS NULL)
    OR (checked_in = TRUE AND checked_in_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS scan_log (
  id BIGSERIAL PRIMARY KEY,
  qr_code TEXT NOT NULL,
  outcome TEXT NOT NULL,
  staff_slot TEXT,
  staff_full_name TEXT,
  staff_role TEXT,
  validated_by TEXT,
  device_id TEXT,
  attendee_id UUID REFERENCES attendees (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scan_log_outcome_chk CHECK (outcome IN ('admitido', 'ya_usado', 'no_encontrado')),
  CONSTRAINT scan_log_device_len_chk CHECK (device_id IS NULL OR char_length(device_id) <= 64)
);

CREATE INDEX IF NOT EXISTS attendees_updated_at_idx ON attendees (updated_at, id);
CREATE INDEX IF NOT EXISTS attendees_created_at_idx ON attendees (created_at);
CREATE INDEX IF NOT EXISTS attendees_checked_in_idx ON attendees (checked_in, checked_in_at);
CREATE INDEX IF NOT EXISTS attendees_staff_slot_idx ON attendees (staff_slot, staff_full_name);
CREATE INDEX IF NOT EXISTS attendees_source_idx ON attendees (source);
CREATE INDEX IF NOT EXISTS attendees_colony_idx ON attendees (colony);
CREATE INDEX IF NOT EXISTS scan_log_qr_idx ON scan_log (qr_code, created_at DESC);
CREATE INDEX IF NOT EXISTS scan_log_created_at_idx ON scan_log (created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendees_set_updated_at ON attendees;
CREATE TRIGGER attendees_set_updated_at
BEFORE UPDATE ON attendees
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE attendees IS
  'Asistentes pre-registrados y capturados en sitio. Cada qr_code admite un solo ingreso.';
COMMENT ON COLUMN attendees.validated_by IS
  'Etiqueta Staff N - Nombre de quien marcó el ingreso (validador o capturista en sitio).';
COMMENT ON COLUMN attendees.phone IS
  '10 dígitos, único en todo el evento.';

COMMIT;

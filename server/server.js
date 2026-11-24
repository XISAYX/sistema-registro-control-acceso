import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pg from "pg";
import {
  cleanColony,
  cleanName,
  clientIdError,
  coerceClientTime,
  colonyError,
  formatMx,
  nameError,
  normalizePhone,
  normalizeQr,
  phoneError,
  qrError,
  roleLabel,
  staffLabel,
  staffRoleError,
  staffSlotError,
} from "../shared/validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const { Pool } = pg;
pg.types.setTypeParser(1184, (value) => value);
pg.types.setTypeParser(1114, (value) => value);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function shouldUseSsl(connectionString) {
  const flag = (process.env.PGSSL || "auto").toLowerCase();
  if (flag === "disable" || flag === "false") return false;
  if (flag === "require" || flag === "true") return true;
  if (
    /sslmode=require|sslmode=verify-full|sslmode=verify-ca/i.test(
      connectionString,
    )
  )
    return true;
  if (
    /supabase\.(co|com)|neon\.tech|railway\.app|render\.com/i.test(
      connectionString,
    )
  )
    return true;
  return false;
}

function connectionStringWithoutSslMode(connectionString) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return connectionString;
  }
}

function createPool() {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error(
      "Falta DATABASE_URL. Copia server/.env.example a server/.env",
    );
    process.exit(1);
  }
  const ssl = shouldUseSsl(raw);
  return new Pool({
    connectionString: connectionStringWithoutSslMode(raw),
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: "registro_actopan",
    ssl: ssl
      ? {
          rejectUnauthorized:
            (process.env.PGSSL_REJECT_UNAUTHORIZED || "true") !== "false",
        }
      : false,
  });
}

const pool = createPool();
pool.on("error", (error) => {
  console.error("Error inesperado del pool de Postgres", error);
});

function tokenMatches(provided) {
  const expected = process.env.STAFF_TOKEN || "";
  if (expected.length < 16) return false;
  const a = crypto
    .createHash("sha256")
    .update(String(provided), "utf8")
    .digest();
  const b = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function requireStaff(req, res, next) {
  const expected = process.env.STAFF_TOKEN || "";
  if (expected.length < 16) {
    return res.status(500).json({
      ok: false,
      error: "El servidor no tiene un STAFF_TOKEN de al menos 16 caracteres.",
    });
  }
  if (!tokenMatches(req.get("x-staff-token") || "")) {
    return res
      .status(401)
      .json({ ok: false, error: "Token de staff inválido." });
  }
  return next();
}

function deviceIdFrom(req) {
  const raw = String(req.get("x-device-id") || "").trim();
  if (!raw || raw.length > 64) return null;
  return raw;
}

function sendDbError(res, error) {
  console.error(error);
  if (error?.code === "42P01") {
    return res.status(500).json({
      ok: false,
      error: "Falta ejecutar sql/schema.sql en la base de datos.",
    });
  }
  if (
    ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P01", "53300"].includes(
      error?.code,
    )
  ) {
    return res
      .status(503)
      .json({ ok: false, error: "Base de datos no disponible." });
  }
  return res.status(500).json({ ok: false, error: "Error interno." });
}

function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((error) => {
      if (res.headersSent) return next(error);
      return sendDbError(res, error);
    });
  };
}

function constraintMessage(error) {
  if (error?.code !== "23505") return null;
  if (error.constraint === "attendees_phone_key")
    return "Ese teléfono ya está registrado.";
  if (error.constraint === "attendees_qr_code_key")
    return "Ese código QR ya existe.";
  if (error.constraint === "attendees_client_id_key")
    return "Ese registro ya existe.";
  return "Ese registro entra en conflicto con uno existente.";
}

function attendeePayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    client_id: row.client_id,
    full_name: row.full_name,
    colony: row.colony,
    phone: row.phone,
    qr_code: row.qr_code,
    source: row.source,
    checked_in: row.checked_in,
    checked_in_at: row.checked_in_at,
    validated_by: row.validated_by,
    staff_slot: row.staff_slot,
    staff_full_name: row.staff_full_name,
    staff_role: row.staff_role,
    registered_by: row.registered_by,
    created_at: row.created_at,
    synced_at: row.synced_at,
    updated_at: row.updated_at,
  };
}

function readPerson(body) {
  const fullName = cleanName(body?.full_name);
  const colony = cleanColony(body?.colony);
  const phone = normalizePhone(body?.phone);
  const qrCode = normalizeQr(body?.qr_code);
  const clientId = String(body?.client_id ?? "")
    .trim()
    .toLowerCase();
  const errors = [
    nameError(fullName),
    colonyError(colony),
    phoneError(phone),
    qrError(qrCode),
    clientIdError(clientId),
  ].filter(Boolean);
  return {
    fullName,
    colony,
    phone,
    qrCode,
    clientId,
    error: errors[0] || null,
  };
}

function readStaff(body) {
  const staffSlot = String(body?.staff_slot ?? "").trim();
  const staffFullName = cleanName(body?.staff_full_name);
  const staffRole = String(body?.staff_role ?? "").trim();
  const errors = [
    staffSlotError(staffSlot),
    nameError(staffFullName),
    staffRoleError(staffRole),
  ].filter(Boolean);
  return {
    staffSlot,
    staffFullName,
    staffRole,
    validatedBy: errors.length ? "" : staffLabel(staffSlot, staffFullName),
    error: errors[0] || null,
  };
}

const INSERT_SQL = `
  INSERT INTO attendees (
    client_id, full_name, colony, phone, qr_code, source,
    checked_in, checked_in_at, validated_by, staff_slot, staff_full_name,
    staff_role, registered_by, created_at, synced_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13, $14, NOW()
  )
  ON CONFLICT (client_id) DO NOTHING
  RETURNING id, client_id
`;

async function insertAttendee(client, record) {
  const inserted = await client.query(INSERT_SQL, [
    record.clientId,
    record.fullName,
    record.colony,
    record.phone,
    record.qrCode,
    record.source,
    record.checkedIn,
    record.checkedInAt,
    record.validatedBy,
    record.staffSlot,
    record.staffFullName,
    record.staffRole,
    record.registeredBy,
    record.createdAt,
  ]);
  if (inserted.rowCount === 1) {
    return { ok: true, inserted: true, id: inserted.rows[0].id };
  }
  return { ok: true, inserted: false, duplicate: true };
}

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
  next();
});

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-staff-token", "x-device-id"],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: "512kb" }));

const publicLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Demasiados intentos. Espera un minuto." },
});
const staffLimiter = rateLimit({
  windowMs: 60_000,
  limit: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Demasiadas peticiones de staff. Espera un minuto.",
  },
});
const exportLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Espera un minuto antes de volver a exportar." },
});

app.get(
  "/api/health",
  asyncRoute(async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: true });
  }),
);

app.get("/api/staff/ping", staffLimiter, requireStaff, (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/api/register",
  publicLimiter,
  asyncRoute(async (req, res) => {
    const person = readPerson(req.body);
    if (person.error)
      return res.status(400).json({ ok: false, error: person.error });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await insertAttendee(client, {
        ...person,
        source: "preregistro",
        checkedIn: false,
        checkedInAt: null,
        validatedBy: null,
        staffSlot: null,
        staffFullName: null,
        staffRole: null,
        registeredBy: "Pre-registro público",
        createdAt: coerceClientTime(req.body?.created_at),
      });
      await client.query("COMMIT");
      return res.status(result.inserted ? 201 : 200).json({
        ok: true,
        client_id: person.clientId,
        qr_code: person.qrCode,
        duplicate: !result.inserted,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      const message = constraintMessage(error);
      if (message) {
        return res.status(409).json({
          ok: false,
          code:
            error.constraint === "attendees_phone_key"
              ? "PHONE_TAKEN"
              : "CONFLICT",
          error: message,
        });
      }
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.post(
  "/api/sync-batch",
  staffLimiter,
  requireStaff,
  asyncRoute(async (req, res) => {
    const rows = req.body?.registrations;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res
        .status(400)
        .json({ ok: false, error: "No hay registros en el lote." });
    }
    if (rows.length > 50) {
      return res
        .status(400)
        .json({ ok: false, error: "El lote máximo es de 50 registros." });
    }

    const client = await pool.connect();
    const results = [];
    try {
      await client.query("BEGIN");
      for (const row of rows) {
        await client.query("SAVEPOINT row_sp");
        try {
          const person = readPerson(row);
          const staff = readStaff({
            ...row,
            staff_role: row?.staff_role || "capturista",
          });
          if (person.error || staff.error || staff.staffRole !== "capturista") {
            results.push({
              client_id: person.clientId || null,
              qr_code: person.qrCode || null,
              ok: false,
              code: "INVALID",
              error:
                person.error ||
                staff.error ||
                "La captura en sitio solo la envía un capturista.",
            });
            await client.query("RELEASE SAVEPOINT row_sp");
            continue;
          }
          const createdAt = coerceClientTime(row?.created_at);
          const result = await insertAttendee(client, {
            ...person,
            source: "live",
            checkedIn: true,
            checkedInAt: createdAt,
            validatedBy: staff.validatedBy,
            staffSlot: staff.staffSlot,
            staffFullName: staff.staffFullName,
            staffRole: "capturista",
            registeredBy: staff.validatedBy,
            createdAt,
          });
          results.push({
            client_id: person.clientId,
            qr_code: person.qrCode,
            ...result,
          });
          await client.query("RELEASE SAVEPOINT row_sp");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT row_sp");
          await client.query("RELEASE SAVEPOINT row_sp");
          const message = constraintMessage(error);
          if (!message) throw error;
          results.push({
            client_id: row?.client_id || null,
            qr_code: normalizeQr(row?.qr_code || ""),
            ok: false,
            code:
              error.constraint === "attendees_phone_key"
                ? "PHONE_TAKEN"
                : "CONFLICT",
            error: message,
          });
        }
      }
      await client.query("COMMIT");
      return res.json({ ok: true, results });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.post(
  "/api/validate-qr",
  staffLimiter,
  requireStaff,
  asyncRoute(async (req, res) => {
    const qrCode = normalizeQr(req.body?.qr_code);
    const staff = readStaff({
      ...req.body,
      staff_role: req.body?.staff_role || "validador",
    });
    const codeError = qrError(qrCode);
    if (codeError) return res.status(400).json({ ok: false, error: codeError });
    if (staff.error)
      return res.status(400).json({ ok: false, error: staff.error });
    if (staff.staffRole !== "validador") {
      return res.status(400).json({
        ok: false,
        error: "Solo un validador puede marcar el ingreso con QR.",
      });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        `
          UPDATE attendees
          SET checked_in = TRUE,
              checked_in_at = NOW(),
              validated_by = $2,
              staff_slot = $3,
              staff_full_name = $4,
              staff_role = $5,
              updated_at = NOW()
          WHERE qr_code = $1 AND checked_in = FALSE
          RETURNING *
        `,
        [
          qrCode,
          staff.validatedBy,
          staff.staffSlot,
          staff.staffFullName,
          staff.staffRole,
        ],
      );

      if (updated.rowCount === 1) {
        const attendee = updated.rows[0];
        await client.query(
          `
            INSERT INTO scan_log (
              qr_code, outcome, staff_slot, staff_full_name, staff_role,
              validated_by, device_id, attendee_id
            ) VALUES ($1, 'admitido', $2, $3, $4, $5, $6, $7)
          `,
          [
            qrCode,
            staff.staffSlot,
            staff.staffFullName,
            staff.staffRole,
            staff.validatedBy,
            deviceIdFrom(req),
            attendee.id,
          ],
        );
        await client.query("COMMIT");
        return res.json({
          ok: true,
          code: "ADMITTED",
          message: "ACCESO PERMITIDO",
          attendee: attendeePayload(attendee),
        });
      }

      const existing = await client.query(
        "SELECT * FROM attendees WHERE qr_code = $1",
        [qrCode],
      );
      if (existing.rowCount === 0) {
        await client.query(
          `
            INSERT INTO scan_log (
              qr_code, outcome, staff_slot, staff_full_name, staff_role, validated_by, device_id
            ) VALUES ($1, 'no_encontrado', $2, $3, $4, $5, $6)
          `,
          [
            qrCode,
            staff.staffSlot,
            staff.staffFullName,
            staff.staffRole,
            staff.validatedBy,
            deviceIdFrom(req),
          ],
        );
        await client.query("COMMIT");
        return res.status(404).json({
          ok: false,
          code: "NOT_FOUND",
          message: "CÓDIGO NO REGISTRADO",
        });
      }

      const attendee = existing.rows[0];
      await client.query(
        `
          INSERT INTO scan_log (
            qr_code, outcome, staff_slot, staff_full_name, staff_role,
            validated_by, device_id, attendee_id
          ) VALUES ($1, 'ya_usado', $2, $3, $4, $5, $6, $7)
        `,
        [
          qrCode,
          staff.staffSlot,
          staff.staffFullName,
          staff.staffRole,
          staff.validatedBy,
          deviceIdFrom(req),
          attendee.id,
        ],
      );
      await client.query("COMMIT");
      return res.status(409).json({
        ok: false,
        code: "ALREADY_USED",
        message: "ERROR: ESTE CÓDIGO QR YA FUE USADO",
        attendee: attendeePayload(attendee),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.get(
  "/api/attendees-cache",
  staffLimiter,
  requireStaff,
  asyncRoute(async (req, res) => {
    const cursorAt = String(req.query.cursor_at || "").trim();
    const cursorId = String(req.query.cursor_id || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 1000);
    if (cursorId && !UUID_RE.test(cursorId)) {
      return res
        .status(400)
        .json({ ok: false, error: "cursor_id no es válido." });
    }
    if ((cursorAt && !cursorId) || (!cursorAt && cursorId)) {
      return res
        .status(400)
        .json({ ok: false, error: "El cursor necesita fecha e id." });
    }
    if (cursorAt && Number.isNaN(new Date(cursorAt).getTime())) {
      return res
        .status(400)
        .json({ ok: false, error: "cursor_at no es válido." });
    }

    const result = await pool.query(
      `
        SELECT id, client_id, full_name, colony, phone, qr_code, source,
               checked_in, checked_in_at, validated_by, staff_slot, staff_full_name,
               staff_role, registered_by, created_at, synced_at, updated_at
        FROM attendees
        WHERE ($1::timestamptz IS NULL AND $2::uuid IS NULL)
           OR updated_at > $1::timestamptz
           OR (updated_at = $1::timestamptz AND id > $2::uuid)
        ORDER BY updated_at ASC, id ASC
        LIMIT $3
      `,
      [cursorAt || null, cursorId || null, limit],
    );
    res.json({
      ok: true,
      attendees: result.rows.map(attendeePayload),
      count: result.rows.length,
      has_more: result.rows.length === limit,
    });
  }),
);

app.get(
  "/api/stats",
  staffLimiter,
  requireStaff,
  asyncRoute(async (_req, res) => {
    const totals = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE checked_in)::int AS ingresados,
        COUNT(*) FILTER (WHERE NOT checked_in)::int AS sin_ingreso,
        COUNT(*) FILTER (WHERE source = 'preregistro')::int AS preregistro,
        COUNT(*) FILTER (WHERE source = 'live')::int AS en_sitio
      FROM attendees
    `);
    const byStaff = await pool.query(`
      SELECT COALESCE(staff_slot, 'Sin asignar') AS staff_slot,
             COALESCE(staff_full_name, '') AS staff_full_name,
             COALESCE(staff_role, '') AS staff_role,
             COUNT(*)::int AS total
      FROM attendees
      GROUP BY 1, 2, 3
      ORDER BY 1, 2
    `);
    res.json({ ok: true, totals: totals.rows[0], by_staff: byStaff.rows });
  }),
);

app.get(
  "/api/export-excel",
  exportLimiter,
  requireStaff,
  asyncRoute(async (_req, res) => {
    const [people, byStaff, byColony, scans] = await Promise.all([
      pool.query(`
        SELECT full_name, colony, phone, source, checked_in, checked_in_at,
               staff_slot, staff_full_name, staff_role, registered_by,
               qr_code, client_id, created_at, synced_at
        FROM attendees
        ORDER BY created_at ASC, full_name ASC
      `),
      pool.query(`
        SELECT COALESCE(staff_slot, 'Sin asignar') AS staff_slot,
               COALESCE(staff_full_name, '') AS staff_full_name,
               COALESCE(staff_role, '') AS staff_role,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE checked_in)::int AS ingresados
        FROM attendees
        GROUP BY 1, 2, 3
        ORDER BY 1, 2
      `),
      pool.query(`
        SELECT colony, COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE checked_in)::int AS ingresados
        FROM attendees
        GROUP BY colony
        ORDER BY total DESC, colony ASC
      `),
      pool.query(`
        SELECT created_at, outcome, qr_code, staff_slot, staff_full_name, staff_role, validated_by, device_id
        FROM scan_log
        ORDER BY created_at ASC
      `),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Registro Actopan";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Asistentes", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = [
      { header: "Nombre completo", key: "full_name", width: 32 },
      { header: "Colonia o localidad", key: "colony", width: 28 },
      { header: "Teléfono", key: "phone", width: 16, style: { numFmt: "@" } },
      { header: "Origen", key: "source", width: 16 },
      { header: "Ingresó", key: "checked_in", width: 12 },
      {
        header: "Hora de ingreso (Ciudad de México)",
        key: "checked_in_at",
        width: 32,
      },
      { header: "Staff Asignado (Staff 1-5)", key: "staff_slot", width: 28 },
      { header: "Nombre del Encargado", key: "staff_full_name", width: 28 },
      { header: "Función", key: "staff_role", width: 16 },
      { header: "Quién registró", key: "registered_by", width: 28 },
      { header: "Código QR", key: "qr_code", width: 42 },
      { header: "ID de registro", key: "client_id", width: 38 },
      {
        header: "Hora de captura (Ciudad de México)",
        key: "created_at",
        width: 32,
      },
      {
        header: "Recibido en servidor (Ciudad de México)",
        key: "synced_at",
        width: 36,
      },
    ];
    for (const row of people.rows) {
      sheet.addRow({
        full_name: row.full_name,
        colony: row.colony,
        phone: String(row.phone),
        source: row.source === "live" ? "En sitio" : "Pre-registro",
        checked_in: row.checked_in ? "Sí" : "No",
        checked_in_at: formatMx(row.checked_in_at),
        staff_slot: row.staff_slot || "",
        staff_full_name: row.staff_full_name || "",
        staff_role: roleLabel(row.staff_role),
        registered_by: row.registered_by || "",
        qr_code: row.qr_code,
        client_id: row.client_id,
        created_at: formatMx(row.created_at),
        synced_at: formatMx(row.synced_at),
      });
    }
    styleHeader(sheet);
    sheet.autoFilter = { from: "A1", to: "N1" };

    const summary = workbook.addWorksheet("Resumen");
    summary.addRow(["Concepto", "Total"]);
    const totals = people.rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.checked_in) acc.ingresados += 1;
        if (row.source === "live") acc.live += 1;
        else acc.pre += 1;
        return acc;
      },
      { total: 0, ingresados: 0, live: 0, pre: 0 },
    );
    summary.addRow(["Asistentes", totals.total]);
    summary.addRow(["Ingresaron", totals.ingresados]);
    summary.addRow(["Sin ingreso", totals.total - totals.ingresados]);
    summary.addRow(["Pre-registro", totals.pre]);
    summary.addRow(["En sitio", totals.live]);
    summary.addRow([]);
    summary.addRow([
      "Staff Asignado (Staff 1-5)",
      "Nombre del Encargado",
      "Función",
      "Registros",
      "Ingresaron",
    ]);
    for (const row of byStaff.rows) {
      summary.addRow([
        row.staff_slot,
        row.staff_full_name,
        roleLabel(row.staff_role),
        row.total,
        row.ingresados,
      ]);
    }
    summary.addRow([]);
    summary.addRow(["Colonia o localidad", "Registros", "Ingresaron"]);
    for (const row of byColony.rows)
      summary.addRow([row.colony, row.total, row.ingresados]);
    summary.getColumn(1).width = 36;
    summary.getColumn(2).width = 28;
    summary.getColumn(3).width = 16;
    summary.getColumn(4).width = 14;
    summary.getColumn(5).width = 14;
    styleHeader(summary);

    const log = workbook.addWorksheet("Escaneos", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    log.columns = [
      { header: "Hora (Ciudad de México)", key: "created_at", width: 28 },
      { header: "Resultado", key: "outcome", width: 16 },
      { header: "Código QR", key: "qr_code", width: 42 },
      { header: "Staff Asignado (Staff 1-5)", key: "staff_slot", width: 28 },
      { header: "Nombre del Encargado", key: "staff_full_name", width: 28 },
      { header: "Función", key: "staff_role", width: 16 },
      { header: "Etiqueta", key: "validated_by", width: 32 },
      { header: "Dispositivo", key: "device_id", width: 38 },
    ];
    for (const row of scans.rows) {
      log.addRow({
        created_at: formatMx(row.created_at),
        outcome: outcomeLabel(row.outcome),
        qr_code: row.qr_code,
        staff_slot: row.staff_slot || "",
        staff_full_name: row.staff_full_name || "",
        staff_role: roleLabel(row.staff_role),
        validated_by: row.validated_by || "",
        device_id: row.device_id || "",
      });
    }
    styleHeader(log);

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="asistentes_actopan.xlsx"',
    );
    res.send(Buffer.from(buffer));
  }),
);

function outcomeLabel(outcome) {
  if (outcome === "admitido") return "Admitido";
  if (outcome === "ya_usado") return "Ya usado";
  if (outcome === "no_encontrado") return "No registrado";
  return outcome;
}

function styleHeader(sheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF691C32" },
  };
  header.alignment = { vertical: "middle" };
  header.height = 22;
}

app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "Ruta no encontrada." });
});

const clientDist = path.join(__dirname, "..", "client", "dist");
const clientIndex = path.join(clientDist, "index.html");
if (fs.existsSync(clientIndex)) {
  app.use(express.static(clientDist, { index: false, maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    return res.sendFile(clientIndex);
  });
}

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  sendDbError(res, error);
});

export default app;

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 8787);
  const server = app.listen(port, () => {
    const token = process.env.STAFF_TOKEN || "";
    console.log(`API de Registro Actopan en http://localhost:${port}`);
    if (token.length < 16) {
      console.warn(
        "STAFF_TOKEN falta o es corto. Las rutas de staff responderán 500.",
      );
    }
    if (!allowedOrigins.length) {
      console.warn(
        "CORS_ORIGIN está vacío. El navegador en otro origen no podrá llamar al API.",
      );
    }
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.close(() => {
        pool.end().finally(() => process.exit(0));
      });
    });
  }
}

import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { roleLabel, staffLabel } from "@shared/validate.js";
import { db } from "../db/localDb.js";
import { clearStaffSession, getStaffSession } from "../lib/staff.js";

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export default function Shell({ title, wide = false, children }) {
  const location = useLocation();
  const isPublic =
    location.pathname === "/" || location.pathname === "/registro";
  const isRegisterForm = location.pathname === "/registro";
  const session = getStaffSession();
  const online = useOnline();
  const pending = useLiveQuery(
    () => db.pendingRegistrations.where("status").equals("pending").count(),
    [],
    0,
  );
  const conflicts = useLiveQuery(
    () => db.pendingRegistrations.where("status").equals("conflict").count(),
    [],
    0,
  );
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    document.title = `${title} · Sistema de Registro y Control de Acceso`;
  }, [title]);

  useEffect(() => {
    const onAuth = () => setAuthError(true);
    window.addEventListener("vg-auth-error", onAuth);
    return () => window.removeEventListener("vg-auth-error", onAuth);
  }, []);

  if (isPublic) {
    return (
      <div className="relative min-h-dvh overflow-x-clip px-4 py-6 text-ink">
        <img
          src="/chalupa.png"
          alt="Chalupa tradicional de Actopan"
          className="pointer-events-none fixed -top-8 -left-8 z-0 w-28 rounded-full object-cover drop-shadow-[0_12px_20px_rgba(74,18,34,0.2)] sm:w-36 md:-top-10 md:-left-10 md:w-48 lg:-top-12 lg:-left-12 lg:w-64 xl:w-72"
        />

        <img
          src="/chalupa2.png"
          alt="Chalupa con salsa verde, pollo y queso"
          className="pointer-events-none fixed -right-8 -bottom-8 z-0 w-28 rounded-full object-cover drop-shadow-[0_12px_20px_rgba(74,18,34,0.2)] sm:w-36 md:-right-10 md:-bottom-10 md:w-48 lg:-right-12 lg:-bottom-12 lg:w-64 xl:w-72"
        />

        <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-md flex-col items-center justify-center gap-4 pt-12 pb-12 md:gap-5 md:py-4">
          <img
            src="/LOGO.png"
            alt="1º Festival y Concurso de la Chalupa 2026"
            className="w-52 max-w-[72vw] object-contain sm:w-64 md:w-72"
          />

          <img
            src="/FRASE.png"
            alt="Orgullo actopense en cada bocado"
            className="w-56 max-w-[78vw] object-contain sm:w-64 md:w-72"
          />

          <div
            className={
              isRegisterForm
                ? "w-full max-w-md rounded-3xl border border-line bg-[#fffdf8]/95 p-5 shadow-[0_18px_36px_rgba(74,18,34,0.16)] [&_button[type='submit']]:bg-pine [&_button[type='submit']]:text-white [&_button[type='submit']]:hover:bg-pine-dark [&_input]:border-line [&_input]:bg-white [&_input]:text-ink [&_label]:font-medium [&_label]:text-pine-dark [&_select]:border-line [&_select]:bg-white [&_select]:text-ink"
                : "w-full max-w-sm rounded-3xl bg-pine shadow-[0_18px_36px_rgba(74,18,34,0.24)] [&>div]:bg-transparent [&>div]:shadow-none"
            }
          >
            {children}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-x-clip text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div
          className={`mx-auto flex w-full items-center justify-between gap-3 pb-3 ${wide ? "max-w-3xl" : "max-w-lg"}`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/LOGO FONDO.png"
              alt="1º Festival y Concurso de la Chalupa 2026"
              className="h-11 w-auto shrink-0 object-contain"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-gold">
                ACTOPAN · HIDALGO
              </p>
              <p className="truncate text-base font-semibold leading-tight text-pine-dark sm:text-lg">
                {title || "Sistema de Registro y Control de Acceso"}
              </p>
            </div>
          </div>

          <div className="shrink-0 text-right text-sm">
            <p
              className={
                online ? "font-semibold text-pine" : "font-semibold text-gold"
              }
            >
              {online ? "En línea" : "Sin red"}
            </p>
            <p>
              {pending} en cola
              {conflicts > 0 ? ` · ${conflicts} con conflicto` : ""}
            </p>
          </div>
        </div>
      </header>

      <main
        className={`relative z-10 mx-auto w-full px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4 ${wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        {authError && (
          <p
            className="mb-4 rounded-2xl bg-[#3f0a16] px-4 py-3 text-sm text-white"
            role="alert"
          >
            El token de staff fue rechazado.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                clearStaffSession();
                window.location.assign("/staff");
              }}
            >
              Volver a identificarse
            </button>
          </p>
        )}

        {session && (
          <p className="mb-4 text-sm text-ink/70">
            {roleLabel(session.staff_role)} ·{" "}
            {staffLabel(session.staff_slot, session.staff_full_name)}
          </p>
        )}

        {children}
      </main>

      <footer
        className={`relative z-10 mx-auto flex w-full flex-wrap gap-x-4 gap-y-2 px-4 pb-8 text-sm ${wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        <NavLink className="text-pine underline" to="/">
          Inicio
        </NavLink>
        <NavLink className="text-pine underline" to="/registro">
          Registro público
        </NavLink>
        {session?.staff_role === "capturista" && (
          <NavLink className="text-pine underline" to="/captura">
            Captura
          </NavLink>
        )}
        {session?.staff_role === "validador" && (
          <NavLink className="text-pine underline" to="/validar">
            Validar
          </NavLink>
        )}
        {session && (
          <NavLink className="text-pine underline" to="/admin">
            Respaldo
          </NavLink>
        )}
        <NavLink className="text-pine underline" to="/staff">
          {session ? "Cambiar staff" : "Soy personal"}
        </NavLink>
      </footer>
    </div>
  );
}

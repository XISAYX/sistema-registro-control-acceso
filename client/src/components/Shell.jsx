import { useEffect, useRef, useState } from "react";
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

const CORNER_CLASSES = {
  "top-left":
    "-top-6 -left-6 sm:-top-10 sm:-left-10 md:-top-12 md:-left-12 lg:-top-16 lg:-left-16 xl:-top-20 xl:-left-20",
  "top-right":
    "-top-6 -right-6 sm:-top-10 sm:-right-10 md:-top-12 md:-right-12 lg:-top-16 lg:-right-16 xl:-top-20 xl:-right-20",
  "bottom-right":
    "-right-6 -bottom-6 sm:-right-10 sm:-bottom-10 md:-right-12 md:-bottom-12 lg:-right-16 lg:-bottom-16 xl:-right-20 xl:-bottom-20",
};

const OPPOSITE_CORNER = {
  "top-left": "bottom-right",
  "top-right": "top-left",
  "bottom-right": "top-left",
};

function DraggableChalupa({ id, cornerKey, initialCorner, src, alt }) {
  const activeCorner = cornerKey || initialCorner;
  const [corner, setCorner] = useState(activeCorner);
  const [hiddenUntil, setHiddenUntil] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const dragStateRef = useRef({
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  });
  const timerRef = useRef(null);

  useEffect(() => {
    setCorner(activeCorner);
    setOffset({ x: 0, y: 0 });
  }, [activeCorner]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hiddenUntil) return;
    const remaining = hiddenUntil - Date.now();
    if (remaining <= 0) {
      setCorner((prev) => OPPOSITE_CORNER[prev] || activeCorner);
      setOffset({ x: 0, y: 0 });
      setHiddenUntil(0);
      return;
    }
    const t = setTimeout(() => {
      setCorner((prev) => OPPOSITE_CORNER[prev] || activeCorner);
      setOffset({ x: 0, y: 0 });
      setHiddenUntil(0);
    }, remaining);
    return () => clearTimeout(t);
  }, [hiddenUntil, activeCorner]);

  const isHidden = hiddenUntil > Date.now();

  function handlePointerDown(event) {
    if (event.pointerType === "touch") {
      event.preventDefault();
      if (timerRef.current) clearTimeout(timerRef.current);
      const targetTime = Date.now() + 60_000;
      setHiddenUntil(targetTime);
      timerRef.current = setTimeout(() => {
        setCorner((prev) => OPPOSITE_CORNER[prev] || activeCorner);
        setOffset({ x: 0, y: 0 });
        setHiddenUntil(0);
      }, 60_000);
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      dragging: true,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
  }

  function handlePointerMove(event) {
    const state = dragStateRef.current;
    if (!state.dragging || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    setOffset({
      x: state.baseX + dx,
      y: state.baseY + dy,
    });
  }

  function handlePointerUp(event) {
    const state = dragStateRef.current;
    if (state.dragging && state.pointerId === event.pointerId) {
      state.dragging = false;
      state.pointerId = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }

  if (isHidden) {
    return null;
  }

  return (
    <img
      key={`${id}-${corner}`}
      src={src}
      alt={alt}
      draggable={false}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
      }}
      className={`pointer-events-auto fixed z-20 w-28 cursor-grab touch-none select-none object-contain drop-shadow-[0_12px_20px_rgba(74,18,34,0.2)] active:cursor-grabbing sm:w-44 md:w-56 lg:w-80 xl:w-96 2xl:w-[27rem] ${CORNER_CLASSES[corner]}`}
    />
  );
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
    const secondCorner = isRegisterForm ? "top-right" : "bottom-right";

    return (
      <div className="relative flex min-h-dvh w-full items-center justify-center overflow-x-clip px-3 py-5 text-ink sm:px-4 sm:py-6">
        <DraggableChalupa
          id="chalupa-1"
          cornerKey="top-left"
          initialCorner="top-left"
          src="/ch.png"
          alt="Chalupa tradicional de Actopan"
        />

        <DraggableChalupa
          id="chalupa-2"
          cornerKey={secondCorner}
          initialCorner={secondCorner}
          src="/ch.png"
          alt="Chalupa con salsa verde, pollo y queso"
        />

        <main className="relative z-10 mx-auto flex w-full max-w-md min-w-0 flex-col items-center justify-center gap-3 sm:gap-4">
          <img
            src="/LOGO.png"
            alt="1º Festival y Concurso de la Chalupa 2026"
            className="w-44 max-w-[68vw] shrink-0 object-contain sm:w-64 md:w-72 lg:w-80"
          />

          <img
            src="/FRASE.png"
            alt="Orgullo actopense en cada bocado"
            className="w-48 max-w-[74vw] shrink-0 object-contain sm:w-68 md:w-76 lg:w-84"
          />

          <div
            className={
              isRegisterForm
                ? "w-full max-w-md min-w-0 rounded-3xl border border-line bg-[#fffdf8]/95 p-4 shadow-[0_18px_36px_rgba(74,18,34,0.16)] sm:p-5 [&>div]:min-w-0 [&>div]:max-w-full [&_button[type='submit']]:w-full [&_button[type='submit']]:max-w-full [&_button[type='submit']]:bg-pine [&_button[type='submit']]:text-white [&_button[type='submit']]:hover:bg-pine-dark [&_input]:w-full [&_input]:min-w-0 [&_input]:max-w-full [&_input]:border-line [&_input]:bg-white [&_input]:text-ink [&_label]:font-medium [&_label]:text-pine-dark [&_select]:w-full [&_select]:min-w-0 [&_select]:max-w-full [&_select]:border-line [&_select]:bg-white [&_select]:text-ink"
                : "font-bebas w-full max-w-[19rem] min-w-0 rounded-3xl bg-pine shadow-[0_18px_36px_rgba(74,18,34,0.24)] sm:max-w-[21rem] [&>div]:bg-transparent [&>div]:p-5 [&>div]:shadow-none sm:[&>div]:p-6 [&_a]:tracking-wider [&_button]:tracking-wider [&_h1]:tracking-wide [&_h2]:tracking-wide"
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

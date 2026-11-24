import { Navigate, useLocation } from "react-router-dom";
import { roleLabel } from "@shared/validate.js";
import { getStaffSession } from "../lib/staff.js";
import Shell from "./Shell.jsx";

export default function StaffGate({ role, children }) {
  const location = useLocation();
  const session = getStaffSession();
  if (!session) {
    const next = encodeURIComponent(location.pathname);
    return <Navigate to={`/staff?next=${next}`} replace />;
  }
  const currentRole = String(session.staff_role || "")
    .trim()
    .toLowerCase();
  const requiredRole = String(role || "")
    .trim()
    .toLowerCase();
  if (requiredRole && currentRole !== requiredRole) {
    return (
      <Shell title="Turno distinto">
        <div className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-line">
          <p className="text-lg">
            Este dispositivo está como{" "}
            {roleLabel(session.staff_role).toLowerCase()}: {session.staff_slot}{" "}
            - {session.staff_full_name}.
          </p>
          <p className="mt-2 text-ink/70">
            La captura y la validación usan turnos distintos. Cambia la
            asignación para entrar aquí.
          </p>
          <a
            className="mt-5 inline-flex h-14 items-center justify-center rounded-2xl bg-pine px-5 text-lg font-semibold text-white"
            href="/staff"
          >
            Cambiar asignación
          </a>
        </div>
      </Shell>
    );
  }
  return children;
}

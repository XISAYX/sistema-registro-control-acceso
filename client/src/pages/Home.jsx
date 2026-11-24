import { Link } from "react-router-dom";
import Shell from "../components/Shell.jsx";

export default function Home() {
  return (
    <Shell title="Registro y acceso">
      <section className="rounded-[2rem] bg-pine px-5 py-7 text-white">
        <p className="text-sm font-semibold tracking-wide text-white/80">
          Antes del evento
        </p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight">
          Regístrate y guarda tu código QR
        </h1>
        <p className="mt-3 text-lg text-white/90">
          Nombre, colonia de Actopan y teléfono. El código se usa una sola vez
          en la entrada.
        </p>
        <Link
          to="/registro"
          className="mt-6 flex h-14 items-center justify-center rounded-2xl bg-white text-lg font-semibold text-pine"
        >
          Quiero registrarme
        </Link>
      </section>
    </Shell>
  );
}

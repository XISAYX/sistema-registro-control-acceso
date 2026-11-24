import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Registro from "./pages/Registro.jsx";
import Captura from "./pages/Captura.jsx";
import StaffAccess from "./pages/StaffAccess.jsx";
import Validar from "./pages/Validar.jsx";
import { useStaffSync } from "./lib/useStaffSync.js";

export default function App() {
  useStaffSync();

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/registro" element={<Registro />} />
      <Route path="/captura" element={<Captura />} />
      <Route path="/validar" element={<Validar />} />
      <Route path="/staff" element={<StaffAccess />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

import { useMemo, useState } from "react";
import { COLONIAS, OTRA } from "../data/colonias.js";

export default function ColonyField({ value, onChange, otra, onOtra }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLocaleLowerCase("es-MX");
  const groups = useMemo(
    () =>
      COLONIAS.map((group) => ({
        ...group,
        items: [...group.items]
          .sort((a, b) => a.localeCompare(b, "es"))
          .filter((item) => !needle || item.toLocaleLowerCase("es-MX").includes(needle) || item === value),
      })).filter((group) => group.items.length > 0),
    [needle, value],
  );

  return (
    <div className="grid gap-2">
      <label className="grid gap-2 text-sm font-semibold">
        Colonia o localidad
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar en Actopan"
          className="h-12 rounded-2xl border border-line bg-white px-4 text-base font-normal"
          autoComplete="off"
        />
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          className="h-14 rounded-2xl border border-line bg-white px-4 text-lg font-normal"
        >
          <option value="">Selecciona</option>
          {groups.map((group) => (
            <optgroup key={group.group} label={group.group}>
              {group.items.map((item) => (
                <option key={`${group.group}-${item}`} value={item}>
                  {item}
                </option>
              ))}
            </optgroup>
          ))}
          <option value={OTRA}>{OTRA}</option>
        </select>
      </label>
      {value === OTRA && (
        <label className="grid gap-2 text-sm font-semibold">
          Escribe la colonia o localidad
          <input
            value={otra}
            onChange={(event) => onOtra(event.target.value)}
            className="h-14 rounded-2xl border border-line bg-white px-4 text-lg font-normal"
            autoComplete="address-level3"
            required
          />
        </label>
      )}
    </div>
  );
}

export const OTRA = "Otra localidad";

export const COLONIAS = [
  {
    group: "Comunidades",
    items: [
      "Benito Juárez",
      "Bothi Baji",
      "Baxaxni",
      "Boxtha",
      "Cañada Aviación",
      "Cañada Chica Antigua",
      "Chicavasco",
      "Colonia Cuauhtémoc",
      "Dajiedi",
      "Daxtha",
      "El Palomo",
      "El Senthe",
      "Huaxtho",
      "La Estancia",
      "La Loma",
      "La Peña",
      "Las Mecas",
      "Mesa Chica",
      "Plomosas",
      "Pozo Grande",
      "San Andres Tianguistengo",
      "San Diego Canguihuindo",
      "Saucillo",
      "Xideje",
    ],
  },
  {
    group: "Colonias",
    items: [
      "Aviación",
      "Benito Juárez",
      "Centro Norte",
      "Colosio",
      "Chapultepec",
      "Deportivo Olímpico",
      "Dos Cerritos",
      "El Cerrito",
      "El Porvenir",
      "Eulalio Ángeles",
      "Fraccionamiento Efrén Rebolledo",
      "Fraccionamiento Nuevo Actopan",
      "Fraccionamiento Guzmán Mayer",
      "Fraccionamiento Guzmán Mayer II",
      "Fraccionamiento Las Monjas",
      "Fundición Alta",
      "Fundición Baja",
      "Guadalupe",
      "Jesús Luz Meneses",
      "La Estación",
      "La Floresta",
      "La Hacienda",
      "Los Olivos",
      "Niños Héroes",
      "Obrera",
      "Rojo Gómez",
      "Tierra y Libertad",
      "Unidad Deportiva",
    ],
  },
];

export function resolveColony(selected, otraText) {
  if (!selected) return { error: "Selecciona la colonia o localidad." };
  if (selected === OTRA) {
    const text = String(otraText ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 3) return { error: "Escribe la colonia o localidad." };
    return { value: `Otra: ${text}` };
  }
  return { value: selected };
}

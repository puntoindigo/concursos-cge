export const DEPARTMENTS = [
  { id: 45, name: 'Paraná' },
  { id: 26, name: 'Colón' },
  { id: 29, name: 'Concordia' },
  { id: 30, name: 'Diamante' },
  { id: 33, name: 'Federación' },
  { id: 59, name: 'Federal' },
  { id: 34, name: 'Feliciano' },
  { id: 37, name: 'Gualeguay' },
  { id: 39, name: 'Gualeguaychú' },
  { id: 57, name: 'Isla del Ibicuy' },
  { id: 41, name: 'La Paz' },
  { id: 43, name: 'Nogoyá' },
]

export const LEVELS = [
  { id: 149, name: 'Inicial' },
  { id: 150, name: 'Primario' },
  { id: 151, name: 'Secundario' },
  { id: 152, name: 'Superior' },
  { id: 208, name: 'Supervisor' },
]

export const CATEGORY_NAME: Record<number, string> = Object.fromEntries(
  [...DEPARTMENTS, ...LEVELS].map((c) => [c.id, c.name])
)

// Quick-search shortcuts by discipline area.
// WP Dirección categories do NOT tag concurso posts — the area info lives in
// post titles only. These map a readable label to the search term that finds them.
export const AREAS = [
  { id: 'ef',    name: 'Educación Física',    term: 'educación física' },
  { id: 'tec',   name: 'Técnica',             term: 'técnica' },
  { id: 'arte',  name: 'Arte / Música',       term: 'artística' },
  { id: 'esp',   name: 'Educación Especial',  term: 'especial' },
  { id: 'adult', name: 'Jóvenes y Adultos',   term: 'adultos' },
  { id: 'priv',  name: 'Privada',             term: 'privada' },
]

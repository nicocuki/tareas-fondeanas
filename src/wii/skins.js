// Juegos Wii: los 8 personajes que se eligen en Tenis Movido y en Fondo Kart. Puro (sin Three.js): lo usan las pantallas
// de elección y los reducers para validar. El modelo 3D que los dibuja está en character.js.
//
// Cada uno: piel, pelo (color y estilo), remera, pantalón y zapatillas. Los colores son fijos, iguales en los dos temas.
export const SKINS = [
  { id: 'nico', name: 'Nico', skin: '#f2c9a0', hair: '#4a2e1a', style: 'short', shirt: '#e8423f', pants: '#2b3a67', shoes: '#ffffff' },
  { id: 'feli', name: 'Feli', skin: '#f7d9bd', hair: '#f2c44e', style: 'pony', shirt: '#3fa7ff', pants: '#f4f4f4', shoes: '#ff6f91' },
  { id: 'tomi', name: 'Tomi', skin: '#8d5a3b', hair: '#1b1b1b', style: 'curly', shirt: '#33c27a', pants: '#3a3a3a', shoes: '#f4f4f4' },
  { id: 'sofi', name: 'Sofi', skin: '#c68a5e', hair: '#2a1a12', style: 'long', shirt: '#b061ff', pants: '#1f2a44', shoes: '#ffd23f' },
  { id: 'juan', name: 'Juan', skin: '#ffe0c4', hair: '#c4572a', style: 'cap', shirt: '#ff9a3c', pants: '#4d6b3a', shoes: '#ffffff', cap: '#1d4ed8' },
  { id: 'lupe', name: 'Lupe', skin: '#5e3a24', hair: '#111111', style: 'bun', shirt: '#ffd23f', pants: '#7a2e8a', shoes: '#111111' },
  { id: 'beto', name: 'Beto', skin: '#e7b48c', hair: '#9a9a9a', style: 'bald', shirt: '#17233b', pants: '#c9b28a', shoes: '#6b3b1f' },
  { id: 'cami', name: 'Cami', skin: '#fbe3cf', hair: '#ff4fa0', style: 'short', shirt: '#14d0c8', pants: '#ffffff', shoes: '#3fa7ff' },
];
export const SKIN_IDS = SKINS.map((s) => s.id);
export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
export const isSkin = (id) => SKIN_IDS.includes(id);
// El primero que no usa nadie (o el primero si están todos).
export function freeSkin(taken) {
  const used = new Set(taken);
  return SKIN_IDS.find((id) => !used.has(id)) || SKIN_IDS[0];
}

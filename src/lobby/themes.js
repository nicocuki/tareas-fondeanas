// La identidad de la sala de espera de cada juego: colores, dibujo de fondo, tipografía, forma del código y qué flota
// en el costado. Todo es solo estética: no toca ninguna regla ni acción. El nombre, el emoji y la frase salen del
// catálogo (`games.js`); acá va lo que hace que cada sala se sienta del juego.
//
// - `a`, `b`: los dos colores del degradado del panel de la izquierda (fijos, iguales en los dos temas).
// - `ink`: color del texto sobre ese panel.
// - `tone`: `dark` oscurece también el lado de las opciones (juegos que ya son oscuros adentro).
// - `pattern`: dibujo de fondo del panel (ver `lobby.css`).
// - `font`: tipografía del título y del código.
// - `tile`: forma de las fichas del código de sala.
// - `deco`: hasta cuatro emojis que flotan en el panel.
// - `motion`: cómo se mueven (`float`, `spin`, `bounce`, `drift`).
import { gameById } from '../ui/games.js';

export const LOBBY_THEMES = {
  abismo: { a: '#021a33', b: '#06477a', ink: '#d6f3ff', tone: 'dark', pattern: 'waves', font: 'vt', tile: 'pixel', deco: ['🫧', '🐟', '🔱', '🫧'], motion: 'float' },
  arena: { a: '#2a1250', b: '#6a2aa8', ink: '#fff4d6', tone: 'dark', pattern: 'checker', font: 'lilita', tile: 'card', deco: ['⚔️', '👑', '🏰', '🧪'], motion: 'bounce' },
  bomber: { a: '#3a1d0e', b: '#c24a1c', ink: '#fff0dc', tone: 'dark', pattern: 'bricks', font: 'pixelify', tile: 'pixel', deco: ['💣', '🔥', '🧱', '💥'], motion: 'bounce' },
  'codigo-secreto': { a: '#5a1216', b: '#c8353b', ink: '#fff1ee', tone: 'light', pattern: 'rays', font: 'display', tile: 'card', deco: ['🕵️', '🔍', '🗝️', '📜'], motion: 'drift' },
  cohetes: { a: '#0d1230', b: '#c4601a', ink: '#fff0e0', tone: 'dark', pattern: 'stars', font: 'anton', tile: 'neon', deco: ['🚀', '💥', '⭐', '🛰️'], motion: 'drift' },
  fps: { a: '#1b1f1a', b: '#a8441a', ink: '#ffe9d6', tone: 'dark', pattern: 'scan', font: 'anton', tile: 'neon', deco: ['🔫', '🎯', '💀', '🛡️'], motion: 'bounce' },
  futbol: { a: '#0d5a2e', b: '#2fbf71', ink: '#f2fff6', tone: 'light', pattern: 'turf', font: 'lilita', tile: 'round', deco: ['⚽', '🥅', '🏆', '🚗'], motion: 'bounce' },
  generala: { a: '#4d1220', b: '#a8324a', ink: '#fff0f2', tone: 'light', pattern: 'felt', font: 'lilita', tile: 'dice', deco: ['🎲', '🎲', '🎯', '🎲'], motion: 'spin' },
  'la-mecha': { a: '#3a1700', b: '#ff7a29', ink: '#fff4e6', tone: 'light', pattern: 'dots', font: 'anton', tile: 'round', deco: ['💣', '🔥', '⏱️', '💥'], motion: 'bounce' },
  meme: { a: '#6e1141', b: '#e0447a', ink: '#fff0f6', tone: 'light', pattern: 'rays', font: 'anton', tile: 'meme', deco: ['😂', '🖼️', '🔥', '💀'], motion: 'bounce' },
  mine: { a: '#1d3a12', b: '#4f9d3a', ink: '#efffe6', tone: 'dark', pattern: 'pixels', font: 'pixelify', tile: 'pixel', deco: ['⛏️', '💎', '🌳', '🧟'], motion: 'float' },
  monopoly: { a: '#0b4a43', b: '#1f9d8a', ink: '#eafffb', tone: 'light', pattern: 'grid', font: 'lilita', tile: 'card', deco: ['🎩', '🏠', '💵', '🚂'], motion: 'float' },
  nave: { a: '#06121f', b: '#1d6e96', ink: '#d9f4ff', tone: 'dark', pattern: 'stars', font: 'nunito', tile: 'neon', deco: ['🚀', '🔧', '🪐', '👀'], motion: 'drift' },
  pista: { a: '#5a1030', b: '#ff4d8d', ink: '#fff0f6', tone: 'dark', pattern: 'stripes', font: 'lilita', tile: 'round', deco: ['🤖', '🔨', '🏁', '⚙️'], motion: 'bounce' },
  pixel: { a: '#1a1244', b: '#7a5af0', ink: '#efeaff', tone: 'dark', pattern: 'pixels', font: 'pixelify', tile: 'pixel', deco: ['🪂', '🔫', '📦', '🌀'], motion: 'float' },
  royale3d: { a: '#06281d', b: '#19a974', ink: '#e6fff4', tone: 'dark', pattern: 'scan', font: 'anton', tile: 'neon', deco: ['🏝️', '🪂', '🧱', '🌩️'], motion: 'float' },
  teg: { a: '#0f2658', b: '#3b6fd4', ink: '#e9f0ff', tone: 'light', pattern: 'grid', font: 'display', tile: 'card', deco: ['🌍', '🎲', '⚔️', '🗺️'], motion: 'spin' },
  timba: { a: '#2a0a3d', b: '#c8902a', ink: '#fff3d0', tone: 'dark', pattern: 'felt', font: 'lilita', tile: 'neon', deco: ['🎰', '💰', '🃏', '🎲'], motion: 'bounce' },
  tiros: { a: '#4a2208', b: '#f28c28', ink: '#fff3e2', tone: 'dark', pattern: 'stripes', font: 'anton', tile: 'round', deco: ['🎯', '💥', '🃏', '⚡'], motion: 'bounce' },
  'cafe-o-te': { a: '#4a2b0c', b: '#d99a4e', ink: '#fff6ea', tone: 'light', pattern: 'dots', font: 'lilita', tile: 'round', deco: ['☕', '🍵', '🤔', '🍪'], motion: 'float' },
};

const FALLBACK = { a: '#2b2f3a', b: '#4a5064', ink: '#f3f1ea', tone: 'light', pattern: 'dots', font: 'display', tile: 'card', deco: ['🎮', '✨'], motion: 'float' };

// Todo lo que se sabe de la sala de espera de un juego: su tema más el nombre, el emoji, la frase y el color del catálogo.
export function lobbyTheme(game) {
  const info = gameById(game);
  return { ...FALLBACK, ...(LOBBY_THEMES[game] || {}), id: game, name: info?.title || '', emoji: info?.emoji || '🎮', tagline: info?.tagline || '', accent: info?.color || 'var(--accent)' };
}

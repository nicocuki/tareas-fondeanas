// Colores y estilos compartidos. Los neutros son variables CSS de src/ui/tokens.css, así el tema
// claro y el oscuro cambian todo. Los colores de equipo y de las casillas son fijos: tienen que
// verse igual en las dos versiones.
export const COLORS = {
  bg: 'var(--bg)',
  panel: 'var(--surface)',
  panelSoft: 'var(--surface-2)',
  panelBorder: 'var(--border)',
  paper: 'var(--paper)',
  paperShadow: 'var(--paper-shadow)',
  ink: 'var(--on-accent)', // texto sobre el color de acento
  muted: 'var(--text-2)',
  dim: 'var(--text-3)',
  gold: 'var(--accent)',
  red: '#c8433a',
  redDark: '#7e2721',
  redText: '#fff1ee',
  redLight: 'var(--team-red-text)',
  blue: '#2b7389',
  blueDark: '#17485a',
  blueText: '#e8f7fb',
  blueLight: 'var(--team-blue-text)',
  yellow: '#e2b62f',
  yellowDark: '#8f6f12',
  yellowText: '#2a2415',
  yellowLight: 'var(--team-yellow-text)',
  green: '#3f8f4f',
  greenDark: '#245a30',
  greenText: '#ecf8ee',
  greenLight: 'var(--team-green-text)',
  assassin: '#141414',
  neutral: '#cdbf98',
  neutralText: '#2a2415',
  cream: 'var(--text)',
  error: 'var(--danger)',
};

const PAPER_INK = 'var(--paper-ink)';
const LIGHT_ON_DARK = '#f4efe3';

// [fondo, texto, borde]
export const CARD_COLORS = {
  red: [COLORS.red, COLORS.redText, COLORS.redDark],
  blue: [COLORS.blue, COLORS.blueText, COLORS.blueDark],
  yellow: [COLORS.yellow, COLORS.yellowText, COLORS.yellowDark],
  green: [COLORS.green, COLORS.greenText, COLORS.greenDark],
  neutral: [COLORS.neutral, COLORS.neutralText, COLORS.paperShadow],
  assassin: [COLORS.assassin, LIGHT_ON_DARK, '#000'],
};
// Casilla sin destapar y casilla ya elegida con el color todavía oculto (revelado diferido).
export const PAPER_CARD = [COLORS.paper, PAPER_INK, COLORS.paperShadow];
export const PICKED_CARD = ['#4a3f2c', LIGHT_ON_DARK, COLORS.gold];

export const TEAM_TEXT = {
  red: COLORS.redLight, blue: COLORS.blueLight, yellow: COLORS.yellowLight, green: COLORS.greenLight,
};
export const TEAM_BUTTON = {
  red: [COLORS.red, COLORS.redText],
  blue: [COLORS.blue, COLORS.blueText],
  yellow: [COLORS.yellow, COLORS.yellowText],
  green: [COLORS.green, COLORS.greenText],
};

// Fondo de la partida según el equipo de turno: suave, para identificarlo sin saturar la vista.
export const TEAM_BG = {
  red: 'var(--team-bg-red)',
  blue: 'var(--team-bg-blue)',
  yellow: 'var(--team-bg-yellow)',
  green: 'var(--team-bg-green)',
  lobby: 'var(--team-bg-lobby)',
  default: 'transparent',
};

export const panelStyle = { background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)' };
export const labelStyle = { fontSize: 12, fontWeight: 600, color: COLORS.muted, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' };
export const inputStyle = { width: '100%', padding: '11px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border-strong)', background: 'var(--input-bg)', color: 'var(--text)', fontSize: 16 };
export const ghostButton = { fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 999, background: COLORS.panelSoft, color: COLORS.cream, border: `1px solid ${COLORS.panelBorder}` };

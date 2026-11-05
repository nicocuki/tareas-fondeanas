// La Timba: la cuota de cada día. Lógica pura, sin nada de la sala.
//
// Fórmula provisional, sacada de partidas del original: Q(d) = B(d) × M(d), donde B(d) es la plata de la caja
// al empezar el día d y M(d) su multiplicador. Como la caja ya arrastra lo que sobró del día anterior, el
// excedente no se suma otra vez. El resultado se redondea a un entero.
//
// Para cambiar los multiplicadores (o la fórmula entera) alcanza con tocar este archivo: la sala solo llama a
// `quotaFor`, y la cantidad de días de la partida es el largo de la lista.
export const QUOTA_MULTIPLIERS = [1.2, 1.15, 1.4, 1.37, 1.85, 2.13, 2.18, 2.52, 2.85, 3.19, 3.43, 3.7];

export const TOTAL_DAYS = QUOTA_MULTIPLIERS.length;

// Multiplicador del día `day` (1 a TOTAL_DAYS); null si el día no existe.
export const multiplierFor = (day) => QUOTA_MULTIPLIERS[day - 1] ?? null;

// Cuánto crecen los límites de apuesta con los días: lo mismo que lo mínimo que puede haber en la caja al empezar el
// día (el producto de los multiplicadores de los días anteriores). Día 1 = ×1, día 4 = ×2,6… y día 12 = ×1.787: ahí
// las apuestas son de miles y hasta de cientos de miles.
export const betScale = (day) => QUOTA_MULTIPLIERS.slice(0, Math.max(0, Math.min(day, TOTAL_DAYS) - 1)).reduce((a, m) => a * m, 1);

// Cuota del día `day` con `bank` en la caja al empezar. Se multiplica en centésimos y recién después se divide:
// así un .5 exacto (1.250 × 1,15 = 1.437,5) redondea siempre para arriba y no depende de los decimales de coma flotante.
export function quotaFor(day, bank) {
  const m = multiplierFor(day);
  if (m === null || !Number.isFinite(bank) || bank < 0) return null;
  return Math.round((Math.round(bank) * Math.round(m * 100)) / 100);
}

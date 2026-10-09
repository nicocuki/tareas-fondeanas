import React from 'react';
import { TEAM_LABEL, majorityFor, operativesOf } from './game.js';
import { COLORS, panelStyle } from '../theme.js';

const RULES = [
  'No se puede decir ninguna palabra que aparezca en el tablero.',
  'No se puede decir mas de una palabra.',
  'No se puede hablar entre agente y espía sobre ningún aspecto de la ronda.',
  'No se puede señalar ni hacer gestos para indicar una casilla.',
  'No se puede dar información adicional de la pista.',
];
// Con revelado al terminar el turno las elecciones se pueden cancelar, así que esta no aplica.
const FINAL_CHOICE = 'No se puede cambiar una elección después de confirmarla.';

export default function Rules({ room, me }) {
  const deferred = !room.options.instantReveal;
  const rules = deferred ? RULES : [...RULES, FINAL_CHOICE];
  const voting = room.teams.some((t) => operativesOf(room, t).length > 1);
  const myTeam = me?.team && operativesOf(room, me.team).length > 1 ? me.team : null;
  const myMajority = myTeam && (
    <> En tu equipo ({TEAM_LABEL[myTeam]}) hacen falta <strong>{majorityFor(room, myTeam)} de {operativesOf(room, myTeam).length}</strong> agentes.</>
  );

  return (
    <details open style={{ ...panelStyle, padding: '10px 12px', marginBottom: 14 }}>
      <summary className="cs-mono" style={{ fontSize: 11, color: COLORS.gold, cursor: 'pointer', listStyle: 'revert' }}>
        reglas de la mesa
      </summary>
      <ol style={{ margin: '10px 0 0', paddingLeft: 18, color: COLORS.cream, fontSize: 12.5, lineHeight: 1.5 }}>
        {rules.map((r) => <li key={r} style={{ marginBottom: 5 }}>{r}</li>)}
      </ol>

      {deferred && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${COLORS.panelBorder}` }}>
          <div className="cs-mono" style={{ fontSize: 11, color: COLORS.gold, marginBottom: 6 }}>elección de casillas</div>
          <div style={{ fontSize: 12.5, color: COLORS.cream, lineHeight: 1.5 }}>
            Los colores se ven recién al apretar «Terminar turno», y ahí se destapan todas las elegidas
            juntas. Hasta ese momento, cualquier casilla elegida se puede sacar tocándola de nuevo.
            {voting && (
              <> Con más de un agente, cada uno vota hasta tantas casillas como diga la pista y puede
              sacar sus votos; una casilla queda elegida cuando la vota la mayoría del equipo.{myMajority}</>
            )}
          </div>
        </div>
      )}

      {!deferred && voting && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${COLORS.panelBorder}` }}>
          <div className="cs-mono" style={{ fontSize: 11, color: COLORS.gold, marginBottom: 6 }}>votación de casillas</div>
          <div style={{ fontSize: 12.5, color: COLORS.cream, lineHeight: 1.5 }}>
            Con más de un agente en el equipo, cada casilla se elige por votación: al tocarla aparecen
            una ✕ y un ✓, y el ✓ confirma tu voto. La casilla se destapa sola cuando la mayoría del
            equipo votó la misma. Si votan todos y no hay mayoría, se borran los votos y se vota de nuevo.
            {myMajority}
          </div>
        </div>
      )}
    </details>
  );
}

import React from 'react';
import { BOMB_CHOICES, GRID_COLS, TIMER_CHOICES, neutralCount } from './game.js';
import LobbyOptions, { Segmented, OptionField as Field } from '../lobby/LobbyOptions.jsx';

const minuteChoices = TIMER_CHOICES.map((m) => ({ value: m, label: m === 0 ? 'Sin límite' : `${m} min` }));
const yesNo = (yes, no) => [{ value: true, label: yes }, { value: false, label: no }];

export default function Options({ options, canEdit, onChange }) {
  const cols = GRID_COLS[options.teamCount];
  const set = (patch) => onChange(patch);
  // Si todo se destapa junto al terminar el turno, no hay «después de una blanca» que decidir.
  const deferred = !options.instantReveal;
  const deferredHint = 'No aplica con «Al terminar el turno»: ahí todas las elegidas se destapan juntas y el turno termina.';

  return (
    <LobbyOptions canEdit={canEdit}>

      <Field
        title="Equipos en total"
        hint={`Tablero de ${cols}×${cols} (${cols * cols} palabras) · ${neutralCount(options)} neutrales. Cada equipo siempre tiene las mismas palabras: 9 el que empieza y 8 los demás.`}
      >
        <Segmented
          name="teamCount"
          value={options.teamCount}
          disabled={!canEdit}
          onChange={(teamCount) => set({ teamCount })}
          choices={[
            { value: 2, label: '2 · rojo y azul' },
            { value: 3, label: '3 · + amarillo' },
            { value: 4, label: '4 · + verde' },
          ]}
        />
      </Field>

      <Field
        title="Cantidad de bombas"
        hint={options.teamCount === 2
          ? 'Las casillas negras. Si un equipo toca una, gana el otro.'
          : 'Las casillas negras. El equipo que toca una queda eliminado y la partida sigue con los demás.'}
      >
        <Segmented
          name="bombs"
          value={options.bombs}
          disabled={!canEdit}
          onChange={(bombs) => set({ bombs })}
          choices={BOMB_CHOICES.map((b) => ({ value: b, label: String(b) }))}
        />
      </Field>

      <Field
        title="Si los agentes tocan una casilla neutral (blanca)"
        hint={deferred ? deferredHint : 'Con «Siguen los intentos», una palabra x3 mantiene los intentos que queden aunque salga una blanca.'}
      >
        <Segmented
          name="keepAfterNeutral"
          value={options.keepAfterNeutral}
          disabled={!canEdit || deferred}
          onChange={(keepAfterNeutral) => set({ keepAfterNeutral })}
          choices={yesNo('Siguen los intentos', 'Se termina el turno')}
        />
      </Field>

      <Field
        title="Si los agentes tocan una casilla del equipo contrario"
        hint={deferred ? deferredHint : 'Lo mismo que arriba, pero cuando la palabra era de otro equipo.'}
      >
        <Segmented
          name="keepAfterOpponent"
          value={options.keepAfterOpponent}
          disabled={!canEdit || deferred}
          onChange={(keepAfterOpponent) => set({ keepAfterOpponent })}
          choices={yesNo('Siguen los intentos', 'Se termina el turno')}
        />
      </Field>

      <Field title="Tiempo del espía para pensar la pista" hint="Si se acaba, el turno pasa al equipo siguiente.">
        <Segmented
          name="clueMinutes"
          value={options.clueMinutes}
          disabled={!canEdit}
          onChange={(clueMinutes) => set({ clueMinutes })}
          choices={minuteChoices}
        />
      </Field>

      <Field title="Tiempo de los agentes para elegir las palabras" hint="Arranca cuando el espía manda la pista.">
        <Segmented
          name="guessMinutes"
          value={options.guessMinutes}
          disabled={!canEdit}
          onChange={(guessMinutes) => set({ guessMinutes })}
          choices={minuteChoices}
        />
      </Field>

      <Field
        title="Cuándo se ve el color de la casilla"
        hint="Con «Al terminar el turno», los agentes eligen sus casillas (y las pueden cancelar) y todas se destapan juntas al apretar «Terminar turno»."
      >
        <Segmented
          name="instantReveal"
          value={options.instantReveal}
          disabled={!canEdit}
          onChange={(instantReveal) => set({ instantReveal })}
          choices={yesNo('Al instante', 'Al terminar el turno')}
        />
      </Field>
    </LobbyOptions>
  );
}

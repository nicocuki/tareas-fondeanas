import React from 'react';
import { COLORS, TEAM_BUTTON } from '../theme.js';
import { isHost } from './game.js';
import {
  LobbyLayout,
  LobbyOptions,
  OptionField,
  Segmented,
  LobbyTeamCard,
  TeamRoleSlot,
  LobbyActionSection,
} from '../lobby/index.js';

export default function CafeOTeLobby({ room, code, me, onDispatch, onLeave, onCopyInvite, copied }) {
  const host = isHost(room, me?.id);
  const options = room.options;

  const getSlotPlayer = (team, role) => {
    return room.players.find((p) => p.team === team && p.role === role);
  };

  const handleOptionChange = (key, value) => {
    if (!host) return;
    onDispatch({ type: 'setOptions', options: { [key]: value } });
  };

  const redPensador = getSlotPlayer('red', 'pensador');
  const redAdivinador = getSlotPlayer('red', 'adivinador');
  const bluePensador = getSlotPlayer('blue', 'pensador');
  const blueAdivinador = getSlotPlayer('blue', 'adivinador');

  const assignedCount = [redPensador, redAdivinador, bluePensador, blueAdivinador].filter(Boolean).length;
  const allAssigned = room.players.length === 4 && room.players.every((p) => p.team && p.role);
  const unassigned = room.players.filter((p) => !p.team || !p.role);

  return (
    <LobbyLayout
      code={code || room?.code}
      gameTitle="sala de espera"
      subtitle={`Compartí el código o el link para que se unan tus amigos.${host ? ' Sos el anfitrión: los modificadores son tuyos.' : ''}`}
      copied={copied}
      onCopyInvite={onCopyInvite}
      onLeave={onLeave}
      leaveText="Salir"
      unassignedPlayers={unassigned}
    >
      {/* Equipos y Roles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
        {/* Equipo Rojo */}
        <LobbyTeamCard
          team="red"
          title="Equipo Rojo"
          icon="🔴"
          color={COLORS.redLight}
        >
          <TeamRoleSlot
            icon="👑"
            label="Pensador"
            members={redPensador ? [redPensador] : []}
            myPlayerId={me?.id}
            hostId={room.hostId}
            isMine={me?.team === 'red' && me?.role === 'pensador'}
            isTaken={Boolean(redPensador && redPensador.id !== me?.id)}
            canPick={Boolean(me)}
            onPick={() => onDispatch({ type: 'pickRole', team: 'red', role: 'pensador' })}
            buttonColors={TEAM_BUTTON.red}
            dataPick="red-pensador"
            showReadyBadge={false}
          />
          <TeamRoleSlot
            icon="🕵️"
            label="Adivinador"
            members={redAdivinador ? [redAdivinador] : []}
            myPlayerId={me?.id}
            hostId={room.hostId}
            isMine={me?.team === 'red' && me?.role === 'adivinador'}
            isTaken={Boolean(redAdivinador && redAdivinador.id !== me?.id)}
            canPick={Boolean(me)}
            onPick={() => onDispatch({ type: 'pickRole', team: 'red', role: 'adivinador' })}
            buttonColors={TEAM_BUTTON.red}
            dataPick="red-adivinador"
            showReadyBadge={false}
          />
        </LobbyTeamCard>

        {/* Equipo Azul */}
        <LobbyTeamCard
          team="blue"
          title="Equipo Azul"
          icon="🔵"
          color={COLORS.blueLight}
        >
          <TeamRoleSlot
            icon="👑"
            label="Pensador"
            members={bluePensador ? [bluePensador] : []}
            myPlayerId={me?.id}
            hostId={room.hostId}
            isMine={me?.team === 'blue' && me?.role === 'pensador'}
            isTaken={Boolean(bluePensador && bluePensador.id !== me?.id)}
            canPick={Boolean(me)}
            onPick={() => onDispatch({ type: 'pickRole', team: 'blue', role: 'pensador' })}
            buttonColors={TEAM_BUTTON.blue}
            dataPick="blue-pensador"
            showReadyBadge={false}
          />
          <TeamRoleSlot
            icon="🕵️"
            label="Adivinador"
            members={blueAdivinador ? [blueAdivinador] : []}
            myPlayerId={me?.id}
            hostId={room.hostId}
            isMine={me?.team === 'blue' && me?.role === 'adivinador'}
            isTaken={Boolean(blueAdivinador && blueAdivinador.id !== me?.id)}
            canPick={Boolean(me)}
            onPick={() => onDispatch({ type: 'pickRole', team: 'blue', role: 'adivinador' })}
            buttonColors={TEAM_BUTTON.blue}
            dataPick="blue-adivinador"
            showReadyBadge={false}
          />
        </LobbyTeamCard>
      </div>

      {/* Opciones de la Sala */}
      <LobbyOptions canEdit={host}>
        <OptionField
          title="Tiempo de pensar palabra"
          hint="Tiempo que tendrán los pensadores para acordar la palabra secreta."
        >
          <Segmented
            name="wordTime"
            value={options.wordTime}
            disabled={!host}
            onChange={(val) => handleOptionChange('wordTime', val)}
            choices={[
              { value: 15, label: '15 segundos' },
              { value: 30, label: '30 segundos' },
              { value: 60, label: '60 segundos' },
            ]}
          />
        </OptionField>

        <OptionField
          title="Modo de juego"
          hint="Por tiempo: gana el equipo más rápido · Por contador: gana quien use menos intentos."
        >
          <Segmented
            name="mode"
            value={options.mode}
            disabled={!host}
            onChange={(val) => handleOptionChange('mode', val)}
            choices={[
              { value: 'tiempo', label: 'Por Tiempo (Más rápido)' },
              { value: 'contador', label: 'Por Contador (Menos intentos)' },
            ]}
          />
        </OptionField>

        <OptionField
          title="Tipo de adivinanza"
          hint="Concepto: cualquier frase o cosa · Palabra: exactamente una sola palabra."
        >
          <Segmented
            name="wordType"
            value={options.wordType || 'concepto'}
            disabled={!host}
            onChange={(val) => handleOptionChange('wordType', val)}
            choices={[
              { value: 'concepto', label: 'Concepto (Cualquier frase)' },
              { value: 'palabra', label: 'Palabra (Una sola)' },
            ]}
          />
        </OptionField>

        <OptionField
          title="Ver intentos del rival"
          hint="Permite ver en pantalla el contador e intentos que realiza el equipo rival durante la partida."
        >
          <Segmented
            name="showRivalCounter"
            value={Boolean(options.showRivalCounter)}
            disabled={!host}
            onChange={(val) => handleOptionChange('showRivalCounter', val)}
            choices={[
              { value: true, label: 'Activado' },
              { value: false, label: 'Desactivado' },
            ]}
          />
        </OptionField>
      </LobbyOptions>

      {/* Acciones del Lobby */}
      <LobbyActionSection
        buttonText={
          host
            ? allAssigned
              ? '¡Iniciar Partida!'
              : 'Esperando que se completen los 4 lugares'
            : 'Esperando que el anfitrión inicie la partida…'
        }
        disabled={!host || !allAssigned}
        onClick={() => onDispatch({ type: 'startSecretPhase' })}
        counterText={`(${assignedCount}/4) jugadores asignados`}
        counterColor={allAssigned ? COLORS.greenLight : COLORS.cream}
        statusHint={
          allAssigned
            ? (host ? '¡Equipos completos! Podés iniciar la partida cuando quieras.' : '¡Lugares completos! Esperando que el anfitrión inicie.')
            : 'Se necesitan 4 jugadores: 2 Pensadores y 2 Adivinadores.'
        }
        problems={!allAssigned && assignedCount > 0 ? ['Faltan asignar roles para completar los 4 lugares.'] : []}
      />
    </LobbyLayout>
  );
}

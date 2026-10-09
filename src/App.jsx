import React, { useEffect, useRef, useState } from 'react';
import {
  GRID_COLS, MAX_CLUE, MAX_NAME, TEAM_ICON, TEAM_LABEL,
  applyAction, cleanName, clueProblem, findPlayer, guessLimit, isHost, majorityFor, makeId,
  newRoom, numberProblem, operativesOf, pickedCards, remaining, spymasterOf, startProblems, timerLeft,
} from './codigo-secreto/game.js';
import { backend } from './storage.js';
import { clearSession, loadName, loadSession, saveSession, savedPlayerId } from './session.js';
import {
  CARD_COLORS, COLORS, PICKED_CARD, TEAM_BG, TEAM_BUTTON, TEAM_TEXT,
  ghostButton, inputStyle, labelStyle, panelStyle,
} from './theme.js';
import Options from './codigo-secreto/Options.jsx';
import Chat from './codigo-secreto/Chat.jsx';
import Rules from './codigo-secreto/Rules.jsx';
import Players from './codigo-secreto/Players.jsx';
import { LobbyLayout, LobbyTeamCard, TeamRoleSlot, LobbyActionSection } from './lobby/index.js';
import CafeOTeApp from './cafeote/CafeOTeApp.jsx';
import FutbolApp from './futbol/FutbolApp.jsx';
import MainMenu from './menu/MainMenu.jsx';
import GarticApp from './gartic/GarticApp.jsx';
import Credits from './menu/Credits.jsx';

function gameFromUrl() {
  return new URLSearchParams(window.location.search).get('juego') || '';
}

function codeFromUrl() {
  const code = new URLSearchParams(window.location.search).get('sala') || '';
  return code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

function setUrlCode(code) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('sala', code);
  else url.searchParams.delete('sala');
  window.history.replaceState(null, '', url);
}

function inviteLink(code) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('sala', code);
  return url.toString();
}

function withTimeout(promise, ms = 12000) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function formatClock(ms) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}



const CARD_FONT = { 5: 'clamp(10px, 2.8vw, 14px)', 6: 'clamp(9px, 2.2vw, 13px)', 7: 'clamp(8px, 1.9vw, 12px)' };

export default function App() {
  const [activeGame, setActiveGame] = useState(() => {
    const juego = gameFromUrl();
    if (juego === 'cafe-o-te') return 'cafe-o-te';
    if (juego === 'futbol') return 'futbol';
    if (juego === 'gartic') return 'gartic';
    return codeFromUrl() || loadSession(codeFromUrl()) ? 'codigo-secreto' : 'menu';
  });
  const [name, setName] = useState(loadName);
  const [joinCode, setJoinCode] = useState(codeFromUrl);
  const [session, setSession] = useState(() => loadSession(codeFromUrl()));
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [clueWord, setClueWord] = useState('');
  const [clueNum, setClueNum] = useState(1);
  const [clueError, setClueError] = useState('');
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(null);
  const [hideKey, setHideKey] = useState(false);
  const [, setTick] = useState(0);

  const code = session?.code;

  useEffect(() => {
    if (!code) return undefined;
    setRoom(null);
    return backend.subscribeRoom(
      code,
      (data) => {
        if (data) { setRoom(data); return; }
        clearSession();
        setUrlCode('');
        setSession(null);
        setError('Esa sala ya no existe.');
      },
      () => setError('No se pudo conectar con la sala.'),
    );
  }, [code]);

  useEffect(() => backend.subscribeConnection(setOnline), []);

  const turnKey = room ? `${room.round}:${room.turn}` : '';
  useEffect(() => { setPending(null); }, [turnKey]);

  // El reloj se redibuja solo mientras corre.
  const deadline = room?.timer?.deadline ?? 0;
  const paused = room?.paused === true;
  useEffect(() => {
    if (!deadline || paused) return undefined;
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [deadline, paused]);

  const me = findPlayer(room, session?.playerId);

  function enterRoom(next) {
    saveSession(next);
    setUrlCode(next.code);
    setError('');
    setSession(next);
  }

  async function dispatch(action) {
    if (!session) return null;
    const { code: roomCode, playerId } = session;
    try {
      return await backend.updateRoom(roomCode, (current) => applyAction(current, { ...action, playerId }));
    } catch {
      setError('No se pudo guardar la jugada. Revisá tu conexión.');
      return null;
    }
  }

  // Cuando se acaba el reloj, cualquiera avisa: la transacción deja pasar un solo aviso por turno.
  const timeoutSent = useRef('');
  useEffect(() => {
    if (!room || room.phase !== 'playing' || room.winner || room.paused || !me) return;
    if (!deadline || Date.now() < deadline) return;
    if (timeoutSent.current === turnKey) return;
    timeoutSent.current = turnKey;
    dispatch({ type: 'timeout', round: room.round, turn: room.turn });
  });

  async function handleCreate() {
    const clean = cleanName(name);
    if (!clean) { setError('Escribí tu nombre primero.'); return; }
    setBusy(true);
    setError('');
    try {
      const playerId = makeId();
      const { code: newCode } = await withTimeout(backend.createRoom(() => newRoom(playerId, clean)));
      enterRoom({ code: newCode, playerId, name: clean });
    } catch {
      setError('No se pudo crear la sala. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  async function handleJoin(e) {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean) { setError('Escribí tu nombre primero.'); return; }
    const target = joinCode.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(target)) { setError('El código de sala tiene 4 letras.'); return; }
    setBusy(true);
    setError('');
    try {
      const playerId = savedPlayerId(target, clean) || makeId();
      const result = await withTimeout(
        backend.updateRoom(target, (current) => applyAction(current, { type: 'join', playerId, name: clean })),
      );
      if (!result.room) { setError('No encontramos esa sala.'); return; }
      if (!findPlayer(result.room, playerId)) { setError('La sala está llena.'); return; }
      enterRoom({ code: target, playerId, name: clean });
    } catch {
      setError('No se pudo conectar con la sala. Probá de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  function handleLeave() {
    const leaving = session;
    clearSession();
    setUrlCode('');
    setSession(null);
    setRoom(null);
    setJoinCode('');
    setError('');
    if (leaving) {
      backend.updateRoom(leaving.code, (current) => applyAction(current, { type: 'leave', playerId: leaving.playerId })).catch(() => {});
    }
  }

  async function copyInvite() {
    const link = inviteLink(session.code);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copiá este link:', link);
    }
  }

  async function submitClue(e) {
    e.preventDefault();
    const word = clueWord.trim();
    // El tope puede haber bajado mientras el espía pensaba: se ajusta al número que muestra el select.
    const number = Math.min(Number(clueNum), Math.max(1, remaining(room.board, me.team)));
    const problem = clueProblem(room, word) || numberProblem(room, me.team, number);
    if (problem) { setClueError(problem); return; }
    setClueError('');
    const result = await dispatch({ type: 'clue', word, number, round: room.round, turn: room.turn });
    if (result?.committed) {
      setClueWord('');
      setClueNum(1);
    }
  }

  function backToLobby() {
    if (!room.winner && !window.confirm('¿Terminar esta partida y volver a la sala de espera?')) return;
    dispatch({ type: 'toLobby' });
  }

  const banners = (
    <>
      {backend.isLocal && (
        <div style={{ ...panelStyle, borderColor: COLORS.gold, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: COLORS.muted, textAlign: 'center' }}>
          Modo local: las salas solo se comparten entre pestañas de este navegador.
        </div>
      )}
      {!online && (
        <div role="status" style={{ ...panelStyle, borderColor: COLORS.error, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: COLORS.error, textAlign: 'center' }}>
          Sin conexión. Reconectando…
        </div>
      )}
      {error && session && (
        <button type="button" className="cs-btn" onClick={() => setError('')} style={{ ...panelStyle, width: '100%', borderColor: COLORS.error, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: COLORS.error }}>
          {error} <span style={{ color: COLORS.muted }}>(cerrar)</span>
        </button>
      )}
      {session && room && !me && (
        <div style={{ ...panelStyle, padding: 14, marginBottom: 16, textAlign: 'center', fontSize: 14, color: COLORS.muted }}>
          Ya no estás en esta sala.{' '}
          <button type="button" className="cs-btn" onClick={() => dispatch({ type: 'join', name: session.name })} style={{ ...ghostButton, marginLeft: 6 }}>Volver a entrar</button>{' '}
          <button type="button" className="cs-btn" onClick={handleLeave} style={{ ...ghostButton, marginLeft: 6 }}>Salir</button>
        </div>
      )}
    </>
  );

  // Helper para renderizar la vista actual
  function renderView() {
    // ---------- MENU PRINCIPAL ----------
    if (activeGame === 'menu') {
      return <MainMenu onSelectGame={(gameId) => setActiveGame(gameId)} />;
    }

    // ---------- CAFÉ O TÉ ----------
    if (activeGame === 'cafe-o-te') {
      return <CafeOTeApp onBackToMenu={() => setActiveGame('menu')} />;
    }

    if (activeGame === 'gartic') {
      return <GarticApp onBackToMenu={() => setActiveGame('menu')} />;
    }

    // ---------- FÚTBOL ----------
    if (activeGame === 'futbol') {
      return <FutbolApp onBackToMenu={() => setActiveGame('menu')} />;
    }

    // ---------- HOME DE CÓDIGO SECRETO ----------
    if (!session) {
      return (
        <div className="cs-root" style={{ background: TEAM_BG.lobby, padding: '48px 16px 32px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ maxWidth: 440, width: '100%' }}>
            {banners}
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <button
                type="button"
                className="cs-btn"
                onClick={() => setActiveGame('menu')}
                style={{ ...ghostButton, marginBottom: 16 }}
              >
                ← Volver a Tareas Veganas
              </button>
              <div className="cs-mono" style={{ fontSize: 13, color: COLORS.gold, marginBottom: 8 }}>expediente clasificado</div>
              <h1 className="cs-mono" style={{ fontSize: 38, margin: 0, color: COLORS.cream, lineHeight: 1.2 }}>Código Secreto</h1>
              <p style={{ color: COLORS.muted, marginTop: 10, fontSize: 15 }}>Jugá Codenames online con tus amigos, cada uno desde su pantalla.</p>
            </div>

            <div style={{ ...panelStyle, padding: 24 }}>
              {/* Paso 1: Tu nombre */}
              <div style={{ marginBottom: 24 }}>
                <label htmlFor="cs-name" className="cs-mono" style={{ ...labelStyle, fontSize: 12, marginBottom: 8, letterSpacing: 0.5 }}>
                  1. TU NOMBRE
                </label>
                <input
                  id="cs-name"
                  className="cs-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !joinCode) handleCreate(); }}
                  placeholder="Escribí tu nombre..."
                  maxLength={MAX_NAME}
                  autoComplete="nickname"
                  style={{ ...inputStyle }}
                />
              </div>

              <div className="cs-mono" style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12, letterSpacing: 0.5 }}>
                2. ELEGÍ CÓMO JUGAR
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Opción 1: Crear sala online */}
                <div style={{ background: COLORS.panelSoft, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 6, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, color: COLORS.cream, fontSize: 15 }}>🌐 Crear sala online</span>
                    <span style={{ fontSize: 11, color: COLORS.gold, background: 'rgba(179, 137, 58, 0.15)', padding: '2px 6px', borderRadius: 3 }}>Multijugador</span>
                  </div>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.muted }}>Creá una sala y compartí el enlace con tus amigos.</p>
                  <button
                    type="button"
                    className="cs-btn"
                    disabled={busy}
                    onClick={handleCreate}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 4, background: COLORS.gold, color: COLORS.ink, fontWeight: 700, fontSize: 14 }}
                  >
                    Crear sala nueva
                  </button>
                </div>

                {/* Opción 2: Unirse a sala */}
                <div style={{ background: COLORS.panelSoft, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 6, padding: 14 }}>
                  <div style={{ fontWeight: 700, color: COLORS.cream, fontSize: 15, marginBottom: 6 }}>🔑 Unirse a una sala</div>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: COLORS.muted }}>Ingresá el código de 4 letras que te pasaron.</p>
                  <form onSubmit={handleJoin} style={{ display: 'flex', gap: 8 }}>
                    <input
                      id="cs-code"
                      className="cs-input"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
                      placeholder="ABCD"
                      maxLength={4}
                      autoCapitalize="characters"
                      autoComplete="off"
                      style={{ ...inputStyle, flex: 1, minWidth: 0, letterSpacing: 3, textAlign: 'center', fontWeight: 700 }}
                    />
                    <button
                      type="submit"
                      className="cs-btn"
                      disabled={busy || !joinCode}
                      style={{ padding: '10px 18px', borderRadius: 4, background: COLORS.blue, color: COLORS.blueText, fontWeight: 700 }}
                    >
                      Unirme
                    </button>
                  </form>
                </div>

                {/* Opción 3: Juego local (Próximamente) */}
                <div style={{ background: COLORS.panelSoft, border: `1px dashed ${COLORS.panelBorder}`, borderRadius: 6, padding: 14, opacity: 0.6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: COLORS.cream, fontSize: 15 }}>📱 Juego local</span>
                    <span style={{ fontSize: 11, color: COLORS.dim, background: COLORS.panel, padding: '2px 6px', borderRadius: 3 }}>Próximamente</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: COLORS.dim }}>Para jugar varios en un mismo dispositivo paso a paso.</p>
                </div>
              </div>

              {error && <div role="alert" style={{ color: COLORS.error, fontSize: 13, marginTop: 16, textAlign: 'center' }}>{error}</div>}
            </div>
          </div>
        </div>
      );
    }

    if (!room) {
      return (
        <div className="cs-root" style={{ background: TEAM_BG.lobby, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div className="cs-mono" style={{ color: COLORS.gold, marginBottom: 16 }}>cargando expediente...</div>
            <button type="button" className="cs-btn" onClick={handleLeave} style={ghostButton}>Cancelar</button>
          </div>
        </div>
      );
    }

  const host = isHost(room, session.playerId);

  // ---------- LOBBY ----------
  if (room.phase === 'lobby') {
    const unassigned = room.players.filter((p) => !p.team);
    const problems = startProblems(room);
    const totalPlayers = room.players.length;
    const readyPlayers = room.players.filter((p) => p.ready).length;
    const hasRole = Boolean(me?.team && me?.role);
    const isReady = Boolean(me?.ready);

    return (
      <LobbyLayout
        code={session.code}
        gameTitle="sala de espera"
        subtitle={`Compartí el código o el link para que se unan tus amigos.${host ? ' Sos el anfitrión: los modificadores son tuyos.' : ''}`}
        copied={copied}
        onCopyInvite={copyInvite}
        onLeave={handleLeave}
        leaveText="Salir"
        banners={banners}
        unassignedPlayers={unassigned}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 24 }}>
          {room.teams.map((team) => (
            <LobbyTeamCard
              key={team}
              team={team}
              title={`Equipo ${TEAM_LABEL[team]}`}
              icon={TEAM_ICON[team]}
              color={TEAM_TEXT[team]}
            >
              {['spymaster', 'operative'].map((role) => {
                const members = room.players.filter((p) => p.team === team && p.role === role);
                const mine = me && me.team === team && me.role === role;
                const taken = role === 'spymaster' && members.length > 0 && !mine;
                return (
                  <TeamRoleSlot
                    key={role}
                    icon={role === 'spymaster' ? '👑' : '🕵️'}
                    label={role === 'spymaster' ? 'Espía (líder)' : 'Agentes (miembros)'}
                    members={members}
                    myPlayerId={session.playerId}
                    hostId={room.hostId}
                    canPick={Boolean(me)}
                    isMine={mine}
                    isTaken={taken}
                    onPick={() => dispatch({ type: 'pickRole', team, role })}
                    buttonColors={TEAM_BUTTON[team]}
                    dataPick={`${team}-${role}`}
                    showReadyBadge={true}
                  />
                );
              })}
            </LobbyTeamCard>
          ))}
        </div>

        <Options
          options={room.options}
          canEdit={host}
          onChange={(patch) => dispatch({ type: 'setOptions', options: patch })}
        />

        <LobbyActionSection
          buttonText={
            !hasRole
              ? 'Elegí equipo y rol para prepararte'
              : isReady
                ? '✓ ¡Estás listo! (Tocar para cancelar)'
                : '¡Ponerte Listo!'
          }
          disabled={!me || !hasRole}
          onClick={() => dispatch({ type: 'toggleReady' })}
          variant={!hasRole ? 'soft' : isReady ? 'green' : 'gold'}
          counterText={`(${readyPlayers}/${totalPlayers}) listos`}
          counterColor={readyPlayers === totalPlayers && totalPlayers >= 2 ? COLORS.greenLight : COLORS.cream}
          statusHint={
            readyPlayers === totalPlayers && totalPlayers >= 2
              ? (problems.length > 0 ? 'Faltan roles requeridos para iniciar' : '¡Todos listos! Iniciando partida…')
              : 'Todos los jugadores deben poner listo para que inicie la partida.'
          }
          problems={problems}
        />
      </LobbyLayout>
    );
  }

  // ---------- PARTIDA ----------
  const cols = GRID_COLS[room.options.teamCount] || 5;
  const iAmSpymaster = me?.role === 'spymaster';
  const keyView = (iAmSpymaster && !hideKey) || !!room.winner;
  // Revelado al terminar el turno: las casillas se eligen (y se pueden cancelar) y recién se
  // destapan todas juntas cuando alguien aprieta «Terminar turno».
  const deferred = !room.options.instantReveal;

  const myTeamAlive = me?.team && !room.eliminated.includes(me.team);
  const myTurn = !!(me && myTeamAlive && me.team === room.currentTeam && !room.winner && !room.paused);
  const isMySpymaster = myTurn && me.role === 'spymaster';
  const canGuess = myTurn && me.role === 'operative' && !!room.clue;
  const limit = room.clue ? guessLimit(room.clue) : 0;
  const teamLeft = remaining(room.board, room.currentTeam);
  const need = majorityFor(room, room.currentTeam);
  const teamOperatives = operativesOf(room, room.currentTeam).length;
  const picks = deferred ? pickedCards(room) : [];
  const myVotes = canGuess
    ? Object.keys(room.votes).map(Number).filter((i) => room.votes[i].includes(session.playerId))
    : [];
  const clueNumber = room.clue?.number ?? 0;
  // Lo mismo que valida el reducer, para no ofrecer un ✓ que después se rechaza.
  const canAddVote = (idx) => {
    if (!deferred) return myVotes.length === 0;
    if (myVotes.length >= clueNumber) return false;
    const wouldPick = !picks.includes(idx) && (room.votes[idx]?.length || 0) + 1 >= need;
    return !(wouldPick && picks.length >= clueNumber);
  };
  const pendingIdx = pending != null && room.board[pending] && !room.board[pending].revealed ? pending : null;
  const left = timerLeft(room);

  const headerButton = { ...ghostButton, padding: '7px 12px' };

  const playingBg = room.winner
    ? (TEAM_BG[room.winner] || TEAM_BG.default)
    : (TEAM_BG[room.currentTeam] || TEAM_BG.default);

  return (
    <div className="cs-root" style={{ background: playingBg, padding: '20px 12px 32px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {banners}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12, padding: '8px 14px', background: 'rgba(31, 27, 21, 0.7)', borderRadius: 8, border: `1px solid ${COLORS.panelBorder}` }}>
          <div>
            <div className="cs-mono" style={{ fontSize: 10, color: COLORS.gold, textTransform: 'uppercase', letterSpacing: 1 }}>sala</div>
            <div className="cs-mono" style={{ fontSize: 22, letterSpacing: 4, color: COLORS.cream }}>{session.code}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {room.teams.map((team) => {
              const [bg, fg] = TEAM_BUTTON[team];
              const out = room.eliminated.includes(team);
              const active = room.currentTeam === team && !room.winner && !out;
              return (
                <div key={team} style={{ textAlign: 'center', padding: '6px 14px', borderRadius: 6, background: bg, color: fg, opacity: out ? 0.3 : active ? 1 : 0.6, border: active ? `2px solid ${COLORS.gold}` : '2px solid transparent', boxShadow: active ? '0 0 12px rgba(179,137,58,0.45)' : 'none' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, textDecoration: out ? 'line-through' : 'none' }}>{remaining(room.board, team)}</div>
                  <div className="cs-mono" style={{ fontSize: 10 }}>{out ? 'eliminado' : TEAM_LABEL[team].toLowerCase()}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 12.5, color: COLORS.cream, textAlign: 'right' }}>
            {me ? (
              <span style={{ padding: '4px 10px', borderRadius: 6, background: COLORS.panelSoft, border: `1px solid ${COLORS.panelBorder}` }}>
                👤 <strong>{me.name}</strong> · <span style={{ color: TEAM_TEXT[me.team] || COLORS.muted }}>{TEAM_LABEL[me.team] || 'espectador'}</span> ({me.role === 'spymaster' ? '👑 espía' : me.role === 'operative' ? '🕵️ agente' : 'mirando'})
              </span>
            ) : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <button type="button" className="cs-btn" disabled={!me || !!room.winner} onClick={() => dispatch({ type: 'setPaused', paused: !room.paused })} style={{ ...headerButton, color: room.paused ? COLORS.ink : COLORS.gold, background: room.paused ? COLORS.gold : COLORS.panel, fontWeight: room.paused ? 700 : 400 }}>
            {room.paused ? '▶ Reanudar partida' : '❚❚ Pausar partida'}
          </button>
          {iAmSpymaster && (
            <button type="button" className="cs-btn" onClick={() => setHideKey((v) => !v)} style={headerButton}>
              {hideKey ? 'Mostrar colores del tablero' : 'Ocultar colores del tablero'}
            </button>
          )}
          {left !== null && (
            <div className="cs-mono" style={{ ...headerButton, cursor: 'default', color: left <= 10000 && !room.paused ? COLORS.error : COLORS.cream, minWidth: 116, textAlign: 'center' }}>
              {room.timer.kind === 'clue' ? 'pista' : 'elección'} {formatClock(left)}
            </div>
          )}
        </div>

        {room.paused && (
          <div style={{ ...panelStyle, borderColor: COLORS.gold, padding: 16, marginBottom: 14, textAlign: 'center' }}>
            <div className="cs-mono" style={{ fontSize: 18, color: COLORS.gold }}>partida en pausa</div>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 5 }}>
              {room.pausedBy ? `Pausó ${room.pausedBy}. ` : ''}No se puede jugar ni corre el reloj hasta que se reanude.
            </div>
          </div>
        )}

        {room.winner ? (
          <div style={{ ...panelStyle, textAlign: 'center', borderColor: COLORS.gold, padding: 24, marginBottom: 16, background: 'rgba(31, 27, 21, 0.85)', backdropFilter: 'blur(4px)' }}>
            <div className="cs-mono" style={{ fontSize: 12, color: COLORS.gold, marginBottom: 6 }}>🏆 misión finalizada</div>
            <div className="cs-mono" style={{ fontSize: 26, color: TEAM_TEXT[room.winner], fontWeight: 700 }}>
              ¡Gana el equipo {TEAM_LABEL[room.winner]}!
            </div>
            <div style={{ color: COLORS.muted, fontSize: 13.5, marginTop: 6 }}>
              {room.winReason === 'assassin'
                ? `${room.eliminated.map((t) => TEAM_LABEL[t]).join(', ')} tocó una bomba.`
                : 'Se descubrieron todas sus palabras.'}
            </div>
            <button type="button" className="cs-btn" onClick={() => dispatch({ type: 'newRound' })} style={{ marginTop: 16, padding: '10px 26px', borderRadius: 6, background: COLORS.gold, color: COLORS.ink, fontWeight: 700, fontSize: 14 }}>
              Jugar otra ronda
            </button>
          </div>
        ) : (
          <div style={{ ...panelStyle, padding: '14px 18px', textAlign: 'center', marginBottom: 16, borderLeft: `4px solid ${TEAM_TEXT[room.currentTeam]}`, background: 'rgba(31, 27, 21, 0.8)', backdropFilter: 'blur(4px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16 }}>{TEAM_ICON[room.currentTeam]}</span>
              <span className="cs-mono" style={{ fontSize: 15, fontWeight: 700, color: TEAM_TEXT[room.currentTeam] }}>
                Turno del equipo {TEAM_LABEL[room.currentTeam]}
              </span>
            </div>
            <div style={{ fontSize: 13.5, color: COLORS.cream, marginTop: 5 }} aria-live="polite">
              {room.clue ? (
                <>
                  Pista: <strong style={{ color: COLORS.gold, fontSize: 15, letterSpacing: 0.5 }}>{room.clue.word.toUpperCase()}</strong> · <strong>{room.clue.number}</strong> palabra{room.clue.number === 1 ? '' : 's'}
                  {' '}— <span style={{ color: COLORS.muted }}>{deferred
                    ? `elegidas ${picks.length} de ${limit}`
                    : `intento ${Math.min(room.clue.guesses + 1, limit)} de ${limit}`}</span>
                </>
              ) : (
                <span style={{ color: COLORS.muted }}>
                  {isMySpymaster
                    ? 'Te toca dar la pista a tu equipo con una palabra y un número.'
                    : `Esperando la pista del espía ${spymasterOf(room, room.currentTeam)?.name ? `(${spymasterOf(room, room.currentTeam)?.name})` : ''}…`}
                </span>
              )}
            </div>
          </div>
        )}

        {me && !me.team && (
          <div style={{ ...panelStyle, padding: 14, marginBottom: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 10 }}>Estás mirando la partida. Sumate a un equipo:</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {room.teams.flatMap((team) => ['operative', 'spymaster'].map((role) => {
                const [bg, fg] = TEAM_BUTTON[team];
                return (
                  <button key={team + role} type="button" className="cs-btn" disabled={role === 'spymaster' && !!spymasterOf(room, team)} onClick={() => dispatch({ type: 'pickRole', team, role })} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 4, background: bg, color: fg }}>
                    {role === 'spymaster' ? 'Espía' : 'Agente'} {TEAM_LABEL[team].toLowerCase()}
                  </button>
                );
              }))}
            </div>
          </div>
        )}

        <div className="cs-layout">
          <div className="cs-players">
            <Players room={room} me={me} />
          </div>

          <div className="cs-main">
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 6, marginBottom: 16 }}>
              {room.board.map((card, idx) => {
                const picked = picks.includes(idx);
                const colored = card.revealed || keyView;
                const voters = room.votes[idx]?.length || 0;
                const mine = myVotes.includes(idx);
                // Con revelado al terminar el turno se puede volver a tocar lo propio para sacarlo.
                const clickable = canGuess && !card.revealed && (mine ? deferred : canAddVote(idx));
                const faded = keyView && card.revealed;
                const [bg, textColor, borderColor] = colored
                  ? CARD_COLORS[card.team]
                  : picked ? PICKED_CARD : [COLORS.paper, COLORS.ink, COLORS.paperShadow];
                return (
                  <div key={idx} style={{ position: 'relative', aspectRatio: '1.3', minWidth: 0 }}>
                    <button
                      type="button"
                      className="cs-card"
                      disabled={!clickable}
                      onClick={() => setPending(idx)}
                      aria-label={`${card.word}${colored ? `, ${TEAM_LABEL[card.team]}` : ''}${card.revealed ? ', descubierta' : ''}${picked ? ', elegida' : ''}${voters && need > 1 ? `, ${voters} de ${need} votos` : ''}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        background: bg,
                        color: textColor,
                        border: mine || picked ? `2px solid ${COLORS.gold}` : `1px solid ${borderColor}`,
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '4px 3px',
                        textAlign: 'center',
                        cursor: clickable ? 'pointer' : 'default',
                        opacity: faded ? 0.4 : 1,
                        position: 'relative',
                        font: 'inherit',
                        boxShadow: mine || picked ? '0 0 10px rgba(179,137,58,0.35)' : 'none',
                      }}
                    >
                      {keyView && !card.revealed && (
                        <span aria-hidden="true" style={{ position: 'absolute', top: 3, right: 5, fontSize: 11, opacity: 0.85 }}>{TEAM_ICON[card.team]}</span>
                      )}
                      {picked && (
                        <span aria-hidden="true" style={{ position: 'absolute', top: 2, left: 5, fontSize: 13, fontWeight: 700, color: COLORS.gold }}>✓</span>
                      )}
                      <span style={{ fontSize: CARD_FONT[cols], fontWeight: 700, letterSpacing: '0.2px', lineHeight: 1.15, textDecoration: faded ? 'line-through' : 'none' }}>{card.word}</span>
                      {voters > 0 && need > 1 && !card.revealed && (
                        <span className="cs-mono" style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', fontSize: 10, padding: '1px 7px', borderRadius: 10, background: 'rgba(22, 19, 16, 0.85)', color: COLORS.gold, border: `1px solid ${COLORS.gold}` }}>
                          {voters}/{need}
                        </span>
                      )}
                    </button>

                    {pendingIdx === idx && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(11,9,7,0.78)', borderRadius: 4 }}>
                        {/* Si ya era mía, la ✕ la saca y el ✓ la deja; si no, la ✕ solo cierra. */}
                        <button
                          type="button"
                          className="cs-btn"
                          aria-label={mine ? `Quitar ${card.word}` : `Cancelar ${card.word}`}
                          onClick={() => {
                            setPending(null);
                            if (mine) dispatch({ type: 'unvote', index: idx, round: room.round, turn: room.turn });
                          }}
                          style={{ width: 32, height: 32, borderRadius: '50%', background: COLORS.red, color: COLORS.redText, fontSize: 15, fontWeight: 700, lineHeight: 1 }}
                        >
                          ✕
                        </button>
                        <button
                          type="button"
                          className="cs-btn"
                          aria-label={mine ? `Mantener ${card.word}` : `Confirmar ${card.word}`}
                          onClick={() => {
                            setPending(null);
                            if (!mine) dispatch({ type: 'vote', index: idx, round: room.round, turn: room.turn });
                          }}
                          style={{ width: 32, height: 32, borderRadius: '50%', background: COLORS.green, color: COLORS.greenText, fontSize: 15, fontWeight: 700, lineHeight: 1 }}
                        >
                          ✓
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {isMySpymaster && !room.clue && (
              <form onSubmit={submitClue} style={{ ...panelStyle, padding: 16, marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: '2 1 160px' }}>
                    <label htmlFor="cs-clue" className="cs-mono" style={{ ...labelStyle, fontSize: 11, marginBottom: 4 }}>pista (una sola palabra)</label>
                    <input
                      id="cs-clue"
                      className="cs-input"
                      value={clueWord}
                      onChange={(e) => { setClueWord(e.target.value.replace(/\s+/g, '')); setClueError(''); }}
                      placeholder="Una palabra"
                      maxLength={MAX_CLUE}
                      autoComplete="off"
                      style={{ ...inputStyle, padding: '8px 10px' }}
                    />
                  </div>
                  <div style={{ width: 92 }}>
                    <label htmlFor="cs-num" className="cs-mono" style={{ ...labelStyle, fontSize: 11, marginBottom: 4 }}>intentos</label>
                    <select id="cs-num" className="cs-input" value={Math.min(clueNum, Math.max(1, teamLeft))} onChange={(e) => { setClueNum(Number(e.target.value)); setClueError(''); }} style={{ ...inputStyle, padding: '8px 6px' }}>
                      {Array.from({ length: Math.max(1, teamLeft) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="cs-btn" style={{ padding: '10px 18px', borderRadius: 4, background: COLORS.gold, color: COLORS.ink, fontWeight: 700 }}>
                    Dar pista
                  </button>
                </div>
                <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 8 }}>
                  Sin espacios, y no puede ser una palabra del tablero. Tu equipo tendrá exactamente esa cantidad de intentos (te quedan {teamLeft} palabras).
                </div>
                {clueError && <div role="alert" style={{ color: COLORS.error, fontSize: 13, marginTop: 10 }}>{clueError}</div>}
              </form>
            )}

            {canGuess && deferred && (
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 8, lineHeight: 1.45 }}>
                  {teamOperatives > 1
                    ? `Cada uno puede votar hasta ${clueNumber} casilla${clueNumber === 1 ? '' : 's'} (te quedan ${clueNumber - myVotes.length}) y sacar sus votos tocándolas de nuevo. Una casilla queda elegida cuando la votan ${need} de ${teamOperatives}.`
                    : `Tocá las casillas y confirmá con ✓. Si te arrepentís, tocá una elegida y sacala con la ✕.`}
                  <br />Los colores se ven recién al apretar «Terminar turno».
                </div>
                <button type="button" className="cs-btn" disabled={picks.length < 1} onClick={() => dispatch({ type: 'endTurn', turn: room.turn })} style={{ padding: '9px 20px', borderRadius: 4, background: picks.length ? COLORS.gold : COLORS.panel, color: picks.length ? COLORS.ink : COLORS.cream, fontWeight: picks.length ? 700 : 400, border: `1px solid ${picks.length ? COLORS.gold : COLORS.panelBorder}` }}>
                  Terminar turno
                </button>
                <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6 }}>
                  {picks.length
                    ? `Se van a destapar ${picks.length} casilla${picks.length === 1 ? '' : 's'}.`
                    : 'Elijan al menos una casilla.'}
                </div>
              </div>
            )}

            {canGuess && !deferred && (
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                {teamOperatives > 1 && (
                  <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 8 }}>
                    {myVotes.length
                      ? `Ya votaste ${room.board[myVotes[0]].word}. Hacen falta ${need} de ${teamOperatives} agentes y el voto no se cambia.`
                      : `Tocá una casilla y confirmá con ✓. Se destapa cuando ${need} de ${teamOperatives} agentes voten la misma.`}
                  </div>
                )}
                {room.voteReset > 0 && (
                  <div role="status" style={{ fontSize: 13, color: COLORS.gold, marginBottom: 8 }}>
                    Votaron todos y no hubo mayoría: se borraron los votos, vuelvan a votar.
                  </div>
                )}
                <button type="button" className="cs-btn" disabled={room.clue.guesses < 1} onClick={() => dispatch({ type: 'endTurn', turn: room.turn })} style={{ padding: '9px 20px', borderRadius: 4, background: COLORS.panel, color: COLORS.cream, border: `1px solid ${COLORS.panelBorder}` }}>
                  Terminar turno
                </button>
                {room.clue.guesses < 1 && <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6 }}>Tienen que arriesgar al menos una palabra.</div>}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="cs-btn" onClick={copyInvite} style={ghostButton}>{copied ? '¡Link copiado!' : 'Copiar link de invitación'}</button>
              <button type="button" className="cs-btn" disabled={!me} onClick={backToLobby} style={ghostButton}>Volver a la sala de espera</button>
              <button type="button" className="cs-btn" onClick={handleLeave} style={{ ...ghostButton, color: COLORS.muted }}>Salir</button>
            </div>
          </div>

          <aside className="cs-side">
            <Rules room={room} me={me} />
            <Chat room={room} me={me} onSend={(message) => dispatch({ type: 'chat', ...message })} />
            {room.log.length > 0 && (
              <div style={{ ...panelStyle, padding: 12 }}>
                <div className="cs-mono" style={{ fontSize: 11, color: COLORS.gold, marginBottom: 8 }}>bitácora de pistas</div>
                <div className="cs-scroll" style={{ maxHeight: 160 }}>
                  {room.log.map((entry, i) => (
                    <div key={i} style={{ fontSize: 13, padding: '3px 0', color: TEAM_TEXT[entry.team] }}>
                      {TEAM_ICON[entry.team]} {entry.word} — {entry.number}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

return (
  <>
    {renderView()}
    <Credits inline={activeGame === 'gartic'} />
  </>
);
}

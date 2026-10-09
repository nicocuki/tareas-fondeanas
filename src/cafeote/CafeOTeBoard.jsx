import React, { useState, useEffect, useRef } from 'react';
import { COLORS, panelStyle, inputStyle, ghostButton } from '../theme.js';
import { isHost } from './game.js';

export default function CafeOTeBoard({ room, me, onDispatch, onLeave }) {
  const host = isHost(room, me?.id);
  const team = me?.team || 'red';
  const role = me?.role || 'pensador';
  const isPensador = role === 'pensador';
  const isAdivinador = role === 'adivinador';

  const myTeamState = room.teamState[team];
  const rivalTeam = team === 'red' ? 'blue' : 'red';
  const rivalTeamState = room.teamState[rivalTeam];

  const [adivinadorInput, setAdivinadorInput] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const chatEndRef = useRef(null);

  // Reloj de tiempo transcurrido
  useEffect(() => {
    if (room.phase !== 'playing' || !room.startTime) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - room.startTime) / 1000));
    }, 500);
    return () => clearInterval(interval);
  }, [room.phase, room.startTime]);

  // Auto scroll en el chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [myTeamState.chain]);

  const handlePensadorClick = (choice) => {
    onDispatch({ type: 'pensadorChoose', choice });
  };

  const handleAdivinadorSubmit = (e) => {
    e.preventDefault();
    if (!adivinadorInput.trim()) return;
    onDispatch({ type: 'adivinadorPropose', proposal: adivinadorInput.trim() });
    setAdivinadorInput('');
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="cs-root" style={{ background: COLORS.bg, padding: '16px', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      
      {/* Contenedor Principal */}
      <div style={{ maxWidth: 560, width: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
        
        {/* Top Header / Bar */}
        <div style={{ ...panelStyle, padding: '12px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <button type="button" className="cs-btn" onClick={onLeave} style={{ ...ghostButton, padding: '4px 8px', fontSize: 11, marginBottom: 4 }}>
              ← Salir
            </button>
            <div className="cs-mono" style={{ fontSize: 12, color: COLORS.gold, fontWeight: 700 }}>
              {team === 'red' ? '🔴 EQUIPO ROJO' : '🔵 EQUIPO AZUL'} · {isPensador ? '👑 Pensador' : '🕵️ Adivinador'}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.cream }}>
              ⏱️ {formatTime(elapsedSeconds)}
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>
              Intentos: <strong style={{ color: COLORS.gold }}>{myTeamState.attempts}</strong>
            </div>
          </div>
        </div>

        {/* Rival Counter Badge */}
        {room.options.showRivalCounter && (
          <div style={{ ...panelStyle, padding: '8px 14px', marginBottom: 12, background: COLORS.panelSoft, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: COLORS.muted }}>
              Rival ({rivalTeam === 'red' ? '🔴 Rojo' : '🔵 Azul'}):
            </span>
            <span style={{ color: COLORS.cream, fontWeight: 600 }}>
              Intentos: {rivalTeamState.attempts} {rivalTeamState.solved ? '✅ ¡Ya la sacó!' : ''}
            </span>
          </div>
        )}

        {/* Notificación si un equipo ya sacó la palabra en modo Contador */}
        {room.options.mode === 'contador' && room.phase === 'playing' && (
          <>
            {myTeamState.solved && (
              <div style={{ background: 'rgba(79, 125, 70, 0.2)', border: `1px solid ${COLORS.green}`, borderRadius: 6, padding: 12, marginBottom: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: COLORS.greenLight, fontWeight: 700 }}>
                  🎉 ¡Tu equipo ya sacó la palabra en {myTeamState.solvedAttempts} intentos!
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
                  Esperando a que el equipo rival intente sacarla en menos intentos... (Llevan {rivalTeamState.attempts} intentos).
                </div>
              </div>
            )}
            {!myTeamState.solved && rivalTeamState.solved && (
              <div style={{ background: 'rgba(179, 137, 58, 0.2)', border: `1px solid ${COLORS.gold}`, borderRadius: 6, padding: 12, marginBottom: 12, textAlign: 'center' }}>
                <div style={{ fontSize: 14, color: COLORS.gold, fontWeight: 700 }}>
                  ⚠️ El equipo rival ya sacó la palabra en {rivalTeamState.solvedAttempts} intentos.
                </div>
                <div style={{ fontSize: 12, color: COLORS.cream, marginTop: 4 }}>
                  Tienen que sacar la palabra en menos de {rivalTeamState.solvedAttempts} intentos para ganar. (Van {myTeamState.attempts} intentos).
                </div>
              </div>
            )}
          </>
        )}

        {/* Palabra Secreta (Visible solo para el Pensador) */}
        {isPensador && (
          <div style={{ background: 'rgba(179, 137, 58, 0.15)', border: `1px solid ${COLORS.gold}`, borderRadius: 6, padding: '8px 14px', marginBottom: 12, textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: COLORS.gold }}>🔒 Secreto a adivinar: </span>
            <strong style={{ fontSize: 15, color: COLORS.cream }}>"{room.secretWord}"</strong>
          </div>
        )}

        {/* Pantalla de Fin de Juego / Victoria */}
        {room.phase === 'ended' && (
          <div style={{ ...panelStyle, padding: 24, marginBottom: 14, textAlign: 'center', borderColor: COLORS.gold }}>
            <div style={{ fontSize: 38, marginBottom: 6 }}>🏆</div>
            <h2 className="cs-mono" style={{ fontSize: 26, color: COLORS.gold, margin: 0 }}>
              {room.winner === team ? '¡VICTORIA!' : room.winner === 'tie' ? '¡EMPATE!' : 'GANÓ EL EQUIPO RIVAL'}
            </h2>
            <p style={{ color: COLORS.cream, marginTop: 8, fontSize: 15 }}>
              El secreto era: <strong>"{room.secretWord}"</strong>
            </p>
            <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 6, display: 'flex', justifyContent: 'center', gap: 16 }}>
              <span>🔴 Rojo: {room.teamState.red.attempts} intentos</span>
              <span>🔵 Azul: {room.teamState.blue.attempts} intentos</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              <button
                type="button"
                className="cs-btn"
                onClick={() => onDispatch({ type: 'restartGame' })}
                style={{ width: '100%', padding: 12, borderRadius: 4, background: COLORS.gold, color: COLORS.ink, fontWeight: 700, fontSize: 15 }}
              >
                🔄 Jugar de nuevo
              </button>

              <button
                type="button"
                className="cs-btn"
                onClick={() => onDispatch({ type: 'toLobby' })}
                style={{ width: '100%', padding: 10, borderRadius: 4, background: COLORS.panelSoft, color: COLORS.cream, border: `1px solid ${COLORS.panelBorder}`, fontWeight: 600, fontSize: 14 }}
              >
                🏠 Volver a la sala de espera
              </button>
            </div>
          </div>
        )}

        {/* CHAT FEED CENTRAL */}
        <div
          className="cs-scroll"
          style={{
            ...panelStyle,
            flex: 1,
            minHeight: 300,
            maxHeight: 440,
            padding: 16,
            marginBottom: 14,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: COLORS.panelSoft,
          }}
        >
          {myTeamState.chain.map((msg, i) => {
            const isSystem = msg.speaker === 'system';
            const isPensadorMsg = msg.speaker === 'pensador';

            if (isSystem) {
              return (
                <div key={msg.id || i} style={{ textAlign: 'center', margin: '8px 0' }}>
                  <span style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, padding: '6px 14px', borderRadius: 12, fontSize: 13, color: COLORS.gold, fontWeight: 700 }}>
                    {msg.text}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={msg.id || i}
                style={{
                  display: 'flex',
                  justifyContent: isPensadorMsg ? 'flex-start' : 'flex-end',
                }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    padding: '10px 14px',
                    borderRadius: isPensadorMsg ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                    background: isPensadorMsg ? COLORS.panel : COLORS.blueDark,
                    border: `1px solid ${isPensadorMsg ? COLORS.panelBorder : COLORS.blue}`,
                    color: COLORS.cream,
                  }}
                >
                  <div style={{ fontSize: 10, color: isPensadorMsg ? COLORS.gold : COLORS.blueLight, marginBottom: 4, fontWeight: 700 }}>
                    {isPensadorMsg ? '👑 PENSADOR Eligió:' : '🕵️ ADIVINADOR Propuso:'}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>
                    {msg.fixed ? `${msg.fixed}  o  ${msg.text}` : msg.text}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* PANEL DE ACCIONES Y CONTROLES */}
        {room.phase === 'playing' && !myTeamState.solved && (
          <div style={{ ...panelStyle, padding: 16 }}>

            {/* CONTROLES PARA EL PENSADOR */}
            {isPensador && (
              <div>
                {myTeamState.turn === 'pensador' ? (
                  <div>
                    {!myTeamState.currentFixed ? (
                      <div>
                        <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 10, textAlign: 'center' }}>
                          Elige tu primera opción de partida:
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            type="button"
                            className="cs-btn"
                            onClick={() => handlePensadorClick('Café')}
                            style={{ flex: 1, padding: 14, borderRadius: 6, background: COLORS.gold, color: COLORS.ink, fontWeight: 700, fontSize: 16 }}
                          >
                            ☕ Café
                          </button>
                          <button
                            type="button"
                            className="cs-btn"
                            onClick={() => handlePensadorClick('Té')}
                            style={{ flex: 1, padding: 14, borderRadius: 6, background: COLORS.gold, color: COLORS.ink, fontWeight: 700, fontSize: 16 }}
                          >
                            🍵 Té
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 13, color: COLORS.gold, marginBottom: 10, textAlign: 'center', fontWeight: 600 }}>
                          Tu adivinador propuso: "{myTeamState.currentProposed}". ¡Elegí una opción!
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <button
                            type="button"
                            className="cs-btn"
                            onClick={() => handlePensadorClick(myTeamState.currentFixed)}
                            style={{ flex: 1, padding: 14, borderRadius: 6, background: COLORS.panelSoft, color: COLORS.cream, border: `1px solid ${COLORS.panelBorder}`, fontWeight: 700, fontSize: 15 }}
                          >
                            {myTeamState.currentFixed}
                          </button>
                          <span style={{ fontSize: 14, color: COLORS.gold, fontWeight: 700 }}>o</span>
                          <button
                            type="button"
                            className="cs-btn"
                            onClick={() => handlePensadorClick(myTeamState.currentProposed)}
                            style={{ flex: 1, padding: 14, borderRadius: 6, background: COLORS.gold, color: COLORS.ink, fontWeight: 700, fontSize: 15 }}
                          >
                            {myTeamState.currentProposed}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: COLORS.muted, fontSize: 13, padding: 8 }}>
                    ⏳ Esperando que tu Adivinador proponga la siguiente opción...
                  </div>
                )}
              </div>
            )}

            {/* CONTROLES PARA EL ADIVINADOR */}
            {isAdivinador && (
              <div>
                {myTeamState.turn === 'adivinador' ? (
                  <form onSubmit={handleAdivinadorSubmit}>
                    <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 8 }}>
                      Opción elegida hasta ahora: <strong style={{ color: COLORS.gold }}>"{myTeamState.currentFixed}"</strong>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ background: COLORS.panelSoft, padding: '10px 12px', borderRadius: 4, color: COLORS.gold, fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>
                        {myTeamState.currentFixed} o
                      </div>
                      <input
                        className="cs-input"
                        value={adivinadorInput}
                        onChange={(e) => setAdivinadorInput(e.target.value)}
                        placeholder="Escribí una opción o adivinanza..."
                        autoFocus
                        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                      />
                      <button
                        type="submit"
                        className="cs-btn"
                        disabled={!adivinadorInput.trim()}
                        style={{ padding: '10px 16px', borderRadius: 4, background: COLORS.blue, color: COLORS.blueText, fontWeight: 700, fontSize: 14 }}
                      >
                        Enviar
                      </button>
                    </div>
                  </form>
                ) : (
                  <div style={{ textAlign: 'center', color: COLORS.muted, fontSize: 13, padding: 8 }}>
                    ⏳ Esperando que el Pensador elija entre las dos opciones...
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

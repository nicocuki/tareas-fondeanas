import React, { useState, useEffect, useRef } from 'react';
import { COLORS, panelStyle, inputStyle, ghostButton } from '../theme.js';

export default function CafeOTeSecretWord({ room, me, onDispatch }) {
  const isPensador = me?.role === 'pensador';
  const [chatText, setChatText] = useState('');
  const [suggestionText, setSuggestionText] = useState('');
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'sugerir'
  const chatEndRef = useRef(null);

  const [timeLeft, setTimeLeft] = useState(() => {
    if (!room.secretWordTimer) return room.options.wordTime;
    return Math.max(0, Math.ceil((room.secretWordTimer - Date.now()) / 1000));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      if (!room.secretWordTimer) return;
      const left = Math.max(0, Math.ceil((room.secretWordTimer - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0 && isPensador) {
        // Si hay alguna sugerencia en el chat, elegir la última sugerida
        const lastSuggestion = [...(room.secretChat || [])].reverse().find((m) => m.isSuggestion);
        if (lastSuggestion) {
          onDispatch({ type: 'forceStartGame', word: lastSuggestion.text });
        } else {
          onDispatch({ type: 'forceStartGame', word: room.options.wordType === 'palabra' ? 'Árbol' : 'Ruedita del mouse' });
        }
      }
    }, 500);

    return () => clearInterval(timer);
  }, [room.secretWordTimer, isPensador, room.secretChat, room.options.wordType, onDispatch]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.secretChat]);

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onDispatch({ type: 'pensadorChat', text: chatText.trim(), isSuggestion: false });
    setChatText('');
  };

  const handleSendSuggestion = (e) => {
    e.preventDefault();
    if (!suggestionText.trim()) return;
    if (room.options.wordType === 'palabra' && /\s/.test(suggestionText.trim())) {
      alert('En modo Palabra solo podés ingresar una única palabra sin espacios.');
      return;
    }
    onDispatch({ type: 'pensadorChat', text: suggestionText.trim(), isSuggestion: true });
    setSuggestionText('');
  };

  const handleToggleLike = (msgId) => {
    onDispatch({ type: 'pensadorLike', msgId });
  };

  return (
    <div className="cs-root" style={{ background: COLORS.bg, padding: '24px 16px', minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ maxWidth: 520, width: '100%' }}>

        {/* Encabezado */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div className="cs-mono" style={{ fontSize: 13, color: COLORS.gold, marginBottom: 4, letterSpacing: 1 }}>
            FASE DE ACUERDO ({room.options.wordType === 'palabra' ? 'SOLO PALABRA' : 'CUALQUIER CONCEPTO'})
          </div>
          <h1 className="cs-mono" style={{ fontSize: 32, margin: 0, color: COLORS.cream, lineHeight: 1.2 }}>
            {isPensador ? 'Pensadores: Elijan el secreto' : 'Los Pensadores están acordando el secreto...'}
          </h1>

          {/* Temporizador */}
          <div style={{ fontSize: 32, fontWeight: 700, color: timeLeft <= 5 ? COLORS.red : COLORS.gold, marginTop: 8 }}>
            ⏱️ {timeLeft}s
          </div>
        </div>

        {isPensador ? (
          <div style={{ ...panelStyle, padding: 16 }}>

            <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 12, textAlign: 'center' }}>
              Chateen para ponerse de acuerdo. Para fijar la palabra, uno debe <strong>sugerirla</strong> y el otro darle <strong>👍 Me gusta</strong>.
            </div>

            {/* FEED DEL CHAT DE PENSADORES */}
            <div
              className="cs-scroll"
              style={{
                background: COLORS.panelSoft,
                border: `1px solid ${COLORS.panelBorder}`,
                borderRadius: 6,
                padding: 14,
                maxHeight: 320,
                minHeight: 220,
                overflowY: 'auto',
                marginBottom: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {room.secretChat?.length === 0 && (
                <div style={{ textAlign: 'center', color: COLORS.dim, fontSize: 13, margin: 'auto' }}>
                  Aún no hay mensajes. ¡Escriban o hagan una sugerencia abajo!
                </div>
              )}

              {room.secretChat?.map((msg) => {
                const isMine = msg.senderId === me?.id;
                const hasLiked = msg.likes?.includes(me?.id);

                if (msg.isSuggestion) {
                  return (
                    <div
                      key={msg.id}
                      style={{
                        background: 'rgba(179, 137, 58, 0.15)',
                        border: `1.5px solid ${COLORS.gold}`,
                        borderRadius: 8,
                        padding: 12,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 11, color: COLORS.gold, fontWeight: 700, marginBottom: 4 }}>
                        💡 SUGERENCIA DE {msg.senderName.toUpperCase()}:
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: COLORS.cream, marginBottom: 8 }}>
                        "{msg.text}"
                      </div>
                      <button
                        type="button"
                        className="cs-btn"
                        onClick={() => handleToggleLike(msg.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 4,
                          background: hasLiked ? COLORS.gold : COLORS.panel,
                          color: hasLiked ? COLORS.ink : COLORS.gold,
                          border: `1px solid ${COLORS.gold}`,
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        👍 {hasLiked ? '¡Te gusta!' : 'Dar Me gusta (Elegir esta)'}
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: isMine ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '80%',
                        padding: '8px 12px',
                        borderRadius: isMine ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                        background: isMine ? COLORS.panel : COLORS.panelBorder,
                        color: COLORS.cream,
                        fontSize: 14,
                      }}
                    >
                      <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 2 }}>{msg.senderName}</div>
                      <div>{msg.text}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* TABS E INPUTS DE ACCIÓN */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button
                type="button"
                className="cs-btn"
                onClick={() => setActiveTab('chat')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 700,
                  background: activeTab === 'chat' ? COLORS.panelBorder : COLORS.panelSoft,
                  color: activeTab === 'chat' ? COLORS.cream : COLORS.muted,
                  border: `1px solid ${COLORS.panelBorder}`,
                }}
              >
                💬 Conversar
              </button>
              <button
                type="button"
                className="cs-btn"
                onClick={() => setActiveTab('sugerir')}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 700,
                  background: activeTab === 'sugerir' ? 'rgba(179, 137, 58, 0.25)' : COLORS.panelSoft,
                  color: activeTab === 'sugerir' ? COLORS.gold : COLORS.muted,
                  border: `1px solid ${activeTab === 'sugerir' ? COLORS.gold : COLORS.panelBorder}`,
                }}
              >
                💡 Sugerir opción
              </button>
            </div>

            {activeTab === 'chat' ? (
              <form onSubmit={handleSendChat} style={{ display: 'flex', gap: 8 }}>
                <input
                  className="cs-input"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Escribí un mensaje..."
                  style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '9px 12px' }}
                />
                <button
                  type="submit"
                  className="cs-btn"
                  disabled={!chatText.trim()}
                  style={{ padding: '9px 16px', borderRadius: 4, background: COLORS.panelBorder, color: COLORS.cream, fontWeight: 700 }}
                >
                  Enviar
                </button>
              </form>
            ) : (
              <form onSubmit={handleSendSuggestion} style={{ display: 'flex', gap: 8 }}>
                <input
                  className="cs-input"
                  value={suggestionText}
                  onChange={(e) => setSuggestionText(e.target.value)}
                  placeholder={room.options.wordType === 'palabra' ? 'Sugerir una palabra (ej: Árbol)' : 'Sugerir concepto (ej: Ruedita del mouse)'}
                  style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '9px 12px', border: `1px solid ${COLORS.gold}` }}
                />
                <button
                  type="submit"
                  className="cs-btn"
                  disabled={!suggestionText.trim()}
                  style={{ padding: '9px 16px', borderRadius: 4, background: COLORS.gold, color: COLORS.ink, fontWeight: 700 }}
                >
                  Sugerir
                </button>
              </form>
            )}

          </div>
        ) : (
          <div style={{ ...panelStyle, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 42, marginBottom: 12 }}>🤫</div>
            <p style={{ color: COLORS.muted, fontSize: 15, margin: 0, lineHeight: 1.5 }}>
              Sos <strong>Adivinador</strong>. Los Pensadores están charlando y proponiendo opciones en su chat exclusivo para elegir el secreto.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

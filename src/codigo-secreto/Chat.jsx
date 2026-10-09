import React, { useEffect, useRef, useState } from 'react';
import { CHAT_MESSAGES, MAX_CHAT_TEXT, cleanChatText } from './game.js';
import { COLORS, TEAM_TEXT, inputStyle, panelStyle } from '../theme.js';

// Global: solo mensajes rápidos. Equipo: texto libre entre agentes, para ponerse de acuerdo.
export default function Chat({ room, me, onSend }) {
  const [scope, setScope] = useState('global');
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  // El espía no entra al canal de equipo: ahí los agentes discuten qué casillas elegir.
  const canTeam = !!(me && me.team && me.role === 'operative');

  useEffect(() => {
    if (!canTeam && scope === 'team') setScope('global');
  }, [canTeam, scope]);

  const messages = room.chat.filter((c) => (
    scope === 'global' ? c.s === 'global' : c.s === 'team' && c.t === me?.team
  ));

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, scope]);

  async function sendText(e) {
    e.preventDefault();
    const text = cleanChatText(draft);
    if (!text) return;
    setDraft('');
    const result = await onSend({ scope: 'team', text });
    // Si no se pudo mandar, se devuelve el texto (salvo que ya hayan empezado a escribir otro).
    if (!result?.committed) setDraft((current) => current || text);
  }

  const tab = (value, label, disabled) => {
    const active = scope === value;
    return (
      <button
        key={value}
        type="button"
        className="cs-btn"
        disabled={disabled}
        aria-pressed={active}
        onClick={() => setScope(value)}
        style={{
          flex: 1,
          padding: '7px 8px',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: active ? 700 : 400,
          background: active ? COLORS.gold : COLORS.panelSoft,
          color: active ? COLORS.ink : COLORS.cream,
          border: `1px solid ${active ? COLORS.gold : COLORS.panelBorder}`,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ ...panelStyle, padding: 12, marginBottom: 14 }}>
      <div className="cs-mono" style={{ fontSize: 11, color: COLORS.gold, marginBottom: 8 }}>chat</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {tab('global', '🌐 Global', false)}
        {tab('team', '🔒 Equipo (Privado)', !canTeam)}
      </div>

      <div
        ref={listRef}
        data-chat-list={scope}
        className="cs-scroll"
        style={{ height: 160, padding: '6px 8px', background: COLORS.bg, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 4, marginBottom: 8 }}
      >
        {messages.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.dim, paddingTop: 6 }}>
            {scope === 'team' ? 'Acá hablan solo los agentes de tu equipo.' : 'Todavía no dijo nada nadie.'}
          </div>
        ) : messages.map((c, i) => (
          <div key={`${c.at}-${c.p}-${i}`} style={{ fontSize: 13, padding: '2px 0', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
            <span style={{ color: TEAM_TEXT[c.t] || COLORS.muted, fontWeight: 700 }}>{c.n}</span>
            <span style={{ color: COLORS.dim }}>: </span>
            <span style={{ color: COLORS.cream }}>{c.x ?? CHAT_MESSAGES[c.m]}</span>
          </div>
        ))}
      </div>

      {scope === 'global' ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CHAT_MESSAGES.map((text, i) => (
            <button
              key={text}
              type="button"
              className="cs-btn"
              disabled={!me}
              onClick={() => onSend({ scope: 'global', msg: i })}
              style={{ padding: '6px 10px', borderRadius: 4, fontSize: 12, background: COLORS.panelSoft, color: COLORS.cream, border: `1px solid ${COLORS.panelBorder}` }}
            >
              {text}
            </button>
          ))}
        </div>
      ) : (
        <>
          <form onSubmit={sendText} style={{ display: 'flex', gap: 6 }}>
            <input
              className="cs-input"
              aria-label="Mensaje para tu equipo"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Escribile a tu equipo…"
              maxLength={MAX_CHAT_TEXT}
              autoComplete="off"
              style={{ ...inputStyle, flex: 1, minWidth: 0, padding: '7px 9px', fontSize: 14 }}
            />
            <button
              type="submit"
              className="cs-btn"
              disabled={!cleanChatText(draft)}
              style={{ padding: '7px 12px', borderRadius: 4, fontSize: 13, fontWeight: 700, background: COLORS.gold, color: COLORS.ink }}
            >
              Enviar
            </button>
          </form>
          <div style={{ fontSize: 11, color: COLORS.dim, marginTop: 7 }}>
            Solo lo ven los agentes de tu equipo. El espía no participa.
          </div>
        </>
      )}
    </div>
  );
}

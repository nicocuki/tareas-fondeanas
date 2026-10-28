// El chat que se abre con T durante la partida. Cerrado, muestra unos segundos los mensajes que van
// llegando (sin tapar los clics); abierto, la charla entera y el campo para escribir.
// Enter manda y cierra, Escape cierra sin mandar. Ver `chat.js` para cómo se guarda.
import { useEffect, useRef, useState } from 'react';
import { onValue, ref, runTransaction } from '../realtime.js';
import { CHAT_LEN, addChatMessage, parseChat } from './chat.js';

const SHOW_MS = 8000;  // cuánto queda a la vista un mensaje nuevo con el chat cerrado
const PEEK = 5;        // cuántos se ven a la vez con el chat cerrado

const isTyping = (el) => el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export default function GameChat({ code, me }) {
  const [chat, setChat] = useState(() => parseChat(null));
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const input = useRef(null);
  const list = useRef(null);

  useEffect(() => {
    if (!code) return undefined;
    return onValue(ref(`chat/${code}`), (snap) => setChat(parseChat(snap.val())));
  }, [code]);

  // T abre (salvo que ya se esté escribiendo en otro campo). preventDefault: si no, la «t» se
  // escribiría en el campo recién enfocado.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'KeyT' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [open, chat.s]);

  // Con el chat cerrado, los mensajes nuevos se van ocultando solos.
  const last = chat.m[chat.m.length - 1];
  useEffect(() => {
    setNow(Date.now());
    if (!last) return undefined;
    const left = last.t + SHOW_MS - Date.now();
    if (left <= 0) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), left + 50);
    return () => clearTimeout(timer);
  }, [last?.k]); // eslint-disable-line react-hooks/exhaustive-deps

  function close() {
    setOpen(false);
    input.current?.blur();
  }

  function send() {
    const value = text;
    setText('');
    close();
    if (!value.trim() || !me) return;
    runTransaction(ref(`chat/${code}`), (raw) => addChatMessage(raw, { id: me.id, name: me.name, text: value, now: Date.now() }) ?? undefined)
      .catch(() => {});
  }

  function onKeyDown(e) {
    // Que el juego no se entere de lo que se escribe (W, Espacio, Escape…).
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); send(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  const shown = open ? chat.m : chat.m.filter((m) => m.t + SHOW_MS > now).slice(-PEEK);
  return (
    <div className={`tf-chat${open ? ' is-open' : ''}`} data-game-chat>
      {shown.length > 0 && (
        <ol ref={list} className="tf-chat-list" data-chat-list>
          {shown.map((m) => (
            <li key={m.k} className={m.i === me?.id ? 'is-mine' : ''}>
              <strong>{m.n}</strong> {m.x}
            </li>
          ))}
        </ol>
      )}
      {open ? (
        <input
          ref={input}
          className="tf-input tf-chat-input"
          value={text}
          maxLength={CHAT_LEN}
          placeholder="Escribí y apretá Enter · Esc para cerrar"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setOpen(false)}
        />
      ) : (
        <button type="button" className="tf-chat-hint" onClick={() => setOpen(true)} title="Abrir el chat">
          💬 <kbd>T</kbd> chat
        </button>
      )}
    </div>
  );
}

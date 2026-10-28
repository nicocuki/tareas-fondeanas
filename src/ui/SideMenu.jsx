// Menú hamburguesa: juegos, unirse con código, perfil, cómo jugar, novedades, ajustes y salir.
import React, { useEffect, useRef, useState } from 'react';
import { gameById } from './games.js';
import { AVATARS, DEFAULT_BOSS_KEY, copyInvite, setPrefs, setProfile, showToast, useCurrentRoom, usePrefs, useProfile } from './store.js';
import { APP_VERSION, UPDATES } from './updates.js';
import JoinByCode from './JoinByCode.jsx';

const VIEWS = {
  perfil: 'Tu perfil',
  ayuda: 'Cómo jugar',
  novedades: 'Novedades',
  ajustes: 'Ajustes',
};

function Chevron() {
  return (
    <svg className="tf-chevron" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MainView({ games, activeGame, onNavigate, onView }) {
  const room = useCurrentRoom();
  const profile = useProfile();
  const [confirming, setConfirming] = useState(false);
  const roomGame = room && gameById(room.game);
  return (
    <>
      <button type="button" className="tf-profile-card" onClick={() => onView('perfil')}>
        <span className="tf-avatar-lg" aria-hidden="true">{profile.avatar}</span>
        <span className="tf-profile-text">
          <strong>{profile.name || 'Sin nombre todavía'}</strong>
          <small>Editar perfil</small>
        </span>
        <Chevron />
      </button>

      {room && (
        <section className="tf-menu-room" style={{ '--chip-color': roomGame?.color }}>
          <div className="tf-menu-room-head">
            <span aria-hidden="true">{roomGame?.emoji}</span>
            <div>
              <small>Estás jugando {roomGame?.title}</small>
              <strong>Sala {room.code}</strong>
            </div>
          </div>
          <div className="tf-menu-room-actions">
            <button type="button" className="tf-btn tf-btn-soft" onClick={() => copyInvite(room.game, room.code)}>Copiar invitación</button>
            {confirming ? (
              <>
                <button
                  type="button"
                  className="tf-btn tf-btn-danger"
                  onClick={() => {
                    room.onLeave?.();
                    showToast('Saliste de la sala');
                    setConfirming(false);
                    onNavigate(room.game);
                  }}
                >
                  Sí, salir
                </button>
                <button type="button" className="tf-btn tf-btn-soft" onClick={() => setConfirming(false)}>Cancelar</button>
              </>
            ) : (
              <button type="button" className="tf-btn tf-btn-danger-soft" onClick={() => setConfirming(true)}>Salir de la partida</button>
            )}
          </div>
        </section>
      )}

      <section className="tf-menu-section">
        <h3 className="tf-menu-label">Unirse con código</h3>
        <JoinByCode compact onJoined={(game, code) => onNavigate(game, code)} />
      </section>

      <section className="tf-menu-section">
        <h3 className="tf-menu-label">Juegos</h3>
        <nav className="tf-menu-games">
          <button type="button" className={`tf-menu-game${!activeGame ? ' is-active' : ''}`} onClick={() => onNavigate('menu')}>
            <span className="tf-menu-game-icon" style={{ '--chip-color': 'var(--accent)' }} aria-hidden="true">🏠</span>
            <span><strong>Inicio</strong><small>Todos los juegos</small></span>
          </button>
          {games.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`tf-menu-game${activeGame === g.id ? ' is-active' : ''}`}
              onClick={() => onNavigate(g.id)}
            >
              <span className="tf-menu-game-icon" style={{ '--chip-color': g.color }} aria-hidden="true">{g.emoji}</span>
              <span><strong>{g.title}</strong><small>👥 {g.players} · {g.duration}</small></span>
              {g.badge && <em className="tf-badge">{g.badge}</em>}
            </button>
          ))}
        </nav>
      </section>

      <section className="tf-menu-section">
        <nav className="tf-menu-links">
          <button type="button" onClick={() => onView('ayuda')}><span aria-hidden="true">📖</span> Cómo jugar <Chevron /></button>
          <button type="button" onClick={() => onView('novedades')}><span aria-hidden="true">✨</span> Novedades <em className="tf-version">{APP_VERSION}</em> <Chevron /></button>
          <button type="button" onClick={() => onView('ajustes')}><span aria-hidden="true">⚙️</span> Ajustes <Chevron /></button>
        </nav>
      </section>
    </>
  );
}

function ProfileView({ onDone }) {
  const profile = useProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  return (
    <form
      className="tf-menu-form"
      onSubmit={(e) => {
        e.preventDefault();
        setProfile({ name, avatar });
        showToast('Perfil guardado');
        onDone();
      }}
    >
      <div className="tf-profile-preview">
        <span className="tf-avatar-xl" aria-hidden="true">{avatar}</span>
        <strong>{name.trim() || 'Tu nombre'}</strong>
      </div>
      <label className="tf-field">
        <span>Nombre</span>
        <input className="tf-input" value={name} maxLength={24} autoComplete="nickname" placeholder="¿Cómo te llamás?" onChange={(e) => setName(e.target.value)} />
      </label>
      <fieldset className="tf-field">
        <legend>Avatar</legend>
        <div className="tf-avatar-grid">
          {AVATARS.map((a) => (
            <button key={a} type="button" aria-label={`Avatar ${a}`} aria-pressed={avatar === a} className={avatar === a ? 'is-selected' : ''} onClick={() => setAvatar(a)}>{a}</button>
          ))}
        </div>
      </fieldset>
      <p className="tf-hint">Tu nombre aparece ya escrito al crear o entrar a una sala. Se guarda solo en este dispositivo.</p>
      <button type="submit" className="tf-btn tf-btn-primary tf-btn-block">Guardar</button>
    </form>
  );
}

function HelpView({ games, activeGame }) {
  return (
    <div className="tf-help">
      {games.map((g) => (
        <details key={g.id} open={g.id === activeGame} style={{ '--chip-color': g.color }}>
          <summary><span aria-hidden="true">{g.emoji}</span> {g.title}<small>{g.players} · {g.duration}</small></summary>
          <ol>{g.howTo.map((step) => <li key={step}>{step}</li>)}</ol>
        </details>
      ))}
      <div className="tf-help-tip">
        <strong>¿Cómo se juega con amigos?</strong>
        <p>Uno crea la sala y comparte el código de 4 letras (o el link). Los demás lo ponen en «Unirse con código». Cada uno juega desde su pantalla.</p>
      </div>
    </div>
  );
}

function NewsView() {
  return (
    <ol className="tf-news">
      {UPDATES.slice(0, 12).map((u) => (
        <li key={u.version + u.title}>
          <div className="tf-news-head">
            <em className={`tf-version${u.latest ? ' is-latest' : ''}`}>v{u.version}</em>
            <strong>{u.title}</strong>
          </div>
          {u.notes.length > 0 && <ul>{u.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </li>
      ))}
    </ol>
  );
}

// Nombre legible de una tecla: «Espacio», «A», «F2», «Ñ»…
function keyLabel(e) {
  if (e.code === 'Space') return 'Espacio';
  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key;
}

// Teclas que no sirven: Escape cancela, Tab mueve el foco y las modificadoras solas no se «tocan».
const BLOCKED_KEYS = ['Escape', 'Tab', 'Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'];

function BossKeySetting({ prefs }) {
  const [listening, setListening] = useState(false);
  const binding = prefs.bossKeyBinding || DEFAULT_BOSS_KEY;

  useEffect(() => {
    if (!listening) return undefined;
    // En captura sobre window: llega antes que el Escape del menú (que escucha en document) y lo frena.
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { setListening(false); return; }
      if (BLOCKED_KEYS.includes(e.key)) return;
      const label = keyLabel(e);
      setPrefs({ bossKeyBinding: { code: e.code, label } });
      showToast(`Tecla de Alt+Tab: ${label}`);
      setListening(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening]);

  return (
    <div className={`tf-bosskey${prefs.bossKey ? ' is-on' : ''}`}>
      <label className="tf-switch-row">
        <span>
          <strong>Tecla de Alt+Tab</strong>
          <small>Al tocar la tecla se abre por encima una pantalla que parece que estás haciendo un TP, por si alguien pasa cerca. Tocala de nuevo para volver al juego.</small>
        </span>
        <input
          type="checkbox"
          className="tf-switch"
          checked={prefs.bossKey}
          onChange={(e) => { setPrefs({ bossKey: e.target.checked }); if (!e.target.checked) setListening(false); }}
        />
      </label>
      {prefs.bossKey && (
        <div className="tf-bosskey-bind">
          <span>Tecla</span>
          <button type="button" data-bosskey className={`tf-keycap${listening ? ' is-listening' : ''}`} onClick={() => setListening((l) => !l)}>
            {listening ? 'Apretá una tecla…' : binding.label}
          </button>
          <small aria-live="polite">{listening ? 'Esc para cancelar.' : 'Tocá el botón para cambiarla.'}</small>
        </div>
      )}
    </div>
  );
}

function SettingsView() {
  const prefs = usePrefs();
  const options = [['system', 'Sistema'], ['dark', 'Oscuro'], ['light', 'Claro']];
  return (
    <div className="tf-settings">
      <div className="tf-field">
        <span>Tema</span>
        <div className="tf-segmented" role="radiogroup" aria-label="Tema">
          {options.map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={prefs.theme === value} className={prefs.theme === value ? 'is-selected' : ''} onClick={() => setPrefs({ theme: value })}>{label}</button>
          ))}
        </div>
      </div>
      <label className="tf-switch-row">
        <span>
          <strong>Reducir animaciones</strong>
          <small>Menos movimiento en botones y pantallas.</small>
        </span>
        <input type="checkbox" className="tf-switch" checked={prefs.reducedMotion} onChange={(e) => setPrefs({ reducedMotion: e.target.checked })} />
      </label>
      <BossKeySetting prefs={prefs} />
      <div className="tf-credits-card">
        <strong>Tareas Fondeanas</strong>
        <p>Juegos para jugar con los del fondo, cada uno desde su pantalla. Gratis y sin cuentas.</p>
        <small>{APP_VERSION}</small>
      </div>
    </div>
  );
}

export default function SideMenu({ view, onView, onClose, activeGame, onNavigate, games }) {
  const panel = useRef(null);
  const open = Boolean(view);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); view === 'main' ? onClose() : onView('main'); }
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('tf-no-scroll');
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('tf-no-scroll');
    };
  }, [open, view]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`tf-drawer${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="tf-drawer-backdrop" onClick={onClose} />
      <aside ref={panel} className="tf-drawer-panel" role="dialog" aria-modal="true" aria-label="Menú" tabIndex={-1}>
        {open && (
          <>
            <div className="tf-drawer-head">
              {view === 'main' ? (
                <strong className="tf-drawer-title">Menú</strong>
              ) : (
                <button type="button" className="tf-back-btn" onClick={() => onView('main')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {VIEWS[view]}
                </button>
              )}
              <button type="button" className="tf-icon-btn" aria-label="Cerrar menú" onClick={onClose}>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div className="tf-drawer-body" key={view}>
              {view === 'main' && <MainView games={games} activeGame={activeGame} onNavigate={onNavigate} onView={onView} />}
              {view === 'perfil' && <ProfileView onDone={() => onView('main')} />}
              {view === 'ayuda' && <HelpView games={games} activeGame={activeGame} />}
              {view === 'novedades' && <NewsView />}
              {view === 'ajustes' && <SettingsView />}
            </div>
            {view === 'main' && (
              <div className="tf-drawer-foot">
                <span>Tareas Fondeanas</span>
                <span>{APP_VERSION}</span>
              </div>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

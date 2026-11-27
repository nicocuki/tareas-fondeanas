// Los HUD de la partida: barra y lista de tareas, botones redondos de acción, aviso de sabotaje y el
// mapa de la nave. El mapa NO tapa el juego: no frena el movimiento (el teclado sigue andando) y solo
// los botones capturan el mouse.
import React, { useEffect, useRef, useState } from 'react';
import { everyFrame } from '../ticker.js';
import { H, LIGHTS_PANEL, REACTOR_HANDS, W } from './map.js';
import { currentStation, taskDone } from './tasks.js';
import { taskLabel } from './game.js';
import { drawShipMap } from './render.js';

// ─── Íconos (línea, sin emojis) ──────────────────────────────────────────────
const ICONS = {
  hand: <><path d="M8 13V5.5a1.5 1.5 0 013 0V11" /><path d="M11 10V4.5a1.5 1.5 0 013 0V11" /><path d="M14 6.5a1.5 1.5 0 013 0V13" /><path d="M17 9.5a1.5 1.5 0 013 0V16a6 6 0 01-6 6h-2a6 6 0 01-5-2.7L4 15.4a1.6 1.6 0 012.6-1.8L8 15" /></>,
  megaphone: <><path d="M3 11v2a1 1 0 001 1h2l8 4.5V5.5L6 10H4a1 1 0 00-1 1z" /><path d="M17 9a4 4 0 010 6" /><path d="M19.5 6a8 8 0 010 12" /><path d="M7 14l1 5h2.5l-1-3.5" /></>,
  knife: <><path d="M10.5 13.5L19.5 3.5 21 5 11 14.5z" fill="currentColor" /><path d="M7 12.5l4.5 4.5" /><path d="M3.5 20.5l5-5" strokeWidth="2.6" /></>,
  sabotage: <><path d="M12 3l10 18H2z" /><path d="M12 10v5" strokeWidth="2.2" /><path d="M12 18.2v.1" strokeWidth="2.6" /></>,
  map: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14" /><path d="M15 6v14" /></>,
  vent: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 8.5v7" /><path d="M10.7 8.5v7" /><path d="M14.4 8.5v7" /><path d="M18 8.5v7" /></>,
  alarm: <><circle cx="12" cy="12" r="8" fill="currentColor" fillOpacity=".25" /><circle cx="12" cy="12" r="4.5" fill="currentColor" /><path d="M12 1.5v2.5M3 5l2 2M21 5l-2 2" /></>,
  close: <><path d="M6 6l12 12M18 6L6 18" strokeWidth="2.6" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0012 3z" /></>,
  atom: <><circle cx="12" cy="12" r="1.8" fill="currentColor" /><ellipse cx="12" cy="12" rx="9.5" ry="3.8" /><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" /></>,
};
export function Icon({ name, size = 28 }) {
  return (
    <svg className="nv-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

// ─── Tareas ──────────────────────────────────────────────────────────────────
export function TaskPanel({ room, mine, progress, now, roomName }) {
  const [open, setOpen] = useState(true);
  const sab = room.sabotage;
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
  return (
    <div className={`nv-tasks${open ? '' : ' is-closed'}`}>
      <div className="nv-taskbar" title="Tareas de todos los tripulantes">
        <i style={{ width: `${pct}%` }} />
        <span>TAREAS COMPLETADAS</span>
      </div>
      <div className="nv-tasklist">
        <ul>
          {mine.impostor && <li className="is-impostor">Sabotea y matá a todos.<br /><small>Tareas falsas:</small></li>}
          {sab?.kind === 'lights' && <li className="is-alarm">Electricidad: arreglar las luces ({sab.switches.filter(Boolean).length}/5)</li>}
          {sab?.kind === 'reactor' && <li className="is-alarm">Reactor: ¡fusión en {Math.max(0, Math.ceil((sab.endsAt - now) / 1000))} s! ({sab.hold.filter(Boolean).length}/2)</li>}
          {mine.tasks.map((t, i) => (
            <li key={i} className={taskDone(t) ? 'is-done' : t.d > 0 ? 'is-half' : ''}>{taskLabel(t, roomName(currentStation(t) || t.s[t.s.length - 1]))}</li>
          ))}
        </ul>
        <button type="button" className="nv-tasktab" onClick={() => setOpen(!open)} aria-expanded={open}><span>Tareas</span></button>
      </div>
    </div>
  );
}

// ─── Aviso de sabotaje ───────────────────────────────────────────────────────
export function SabotageBanner({ sab, now, mine }) {
  if (!sab) return null;
  const reactor = sab.kind === 'reactor';
  return (
    <div className={`nv-sab${reactor ? ' is-reactor' : ''}`} role="alert">
      <b>¡SABOTAJE!</b>
      <span>
        {reactor
          ? `Fusión del reactor en ${Math.max(0, Math.ceil((sab.endsAt - now) / 1000))} s: dos personas, una mano en cada lector.`
          : mine.impostor ? 'Apagaste las luces.' : 'Luces apagadas: subí las palancas en Electricidad.'}
      </span>
    </div>
  );
}

// ─── Botones redondos ────────────────────────────────────────────────────────
function RoundBtn({ icon, label, kbd, onClick, disabled, className = '', cooldown = 0, seconds = 0, big = false, ready = false, dataAct }) {
  return (
    <button type="button" className={`nv-round ${className}${big ? ' is-big' : ''}${ready ? ' is-ready' : ''}${seconds > 0 ? ' is-cooling' : ''}`} disabled={disabled} onClick={onClick} data-act={dataAct}
      style={cooldown > 0 ? { '--p': `${Math.min(1, cooldown) * 360}deg` } : undefined}>
      <span className="nv-round-face">
        <Icon name={icon} size={big ? 46 : 36} />
        {seconds > 0 && <b className="nv-round-num">{seconds}</b>}
      </span>
      <span className="nv-round-label">{label}</span>
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  );
}

export function ActionPad({ mine, hud, options, sabotageLeft, mapOpen, onUse, onKill, onReport, onToggleMap }) {
  const useKind = hud.use?.kind;
  const useIcon = useKind === 'button' ? 'alarm' : useKind === 'vent' || useKind === 'exitVent' ? 'vent' : 'hand';
  const killSecs = Math.ceil((hud.killLeft || 0) / 1000);
  return (
    <>
      <div className="nv-topbtns">
        <button type="button" className={`nv-roundmini${mapOpen ? ' is-on' : ''}`} onClick={onToggleMap} aria-label="Mapa" title="Mapa (Tab)"><Icon name="map" size={26} /></button>
      </div>
      <div className="nv-pad">
        {mine.impostor && (
          <RoundBtn className="is-sabo" icon="sabotage" label="Sabotear" disabled={false} seconds={Math.ceil(sabotageLeft / 1000)} cooldown={sabotageLeft > 0 ? 1 : 0} onClick={onToggleMap} />
        )}
        {mine.alive && <RoundBtn className="is-report" icon="megaphone" label="Reportar" kbd="R" disabled={!hud.report} ready={Boolean(hud.report)} onClick={onReport} dataAct="report" />}
        {mine.impostor && mine.alive && (
          <RoundBtn className="is-kill" icon="knife" label="Matar" kbd="Q" disabled={!hud.kill || killSecs > 0} ready={Boolean(hud.kill) && killSecs === 0} seconds={killSecs}
            cooldown={killSecs > 0 ? (hud.killLeft || 0) / ((options.killCooldown || 25) * 1000) : 0} onClick={onKill} dataAct="kill" />
        )}
        <RoundBtn className="is-use" big icon={useIcon} label={hud.use?.label || 'Usar'} kbd="E" disabled={!hud.use} ready={Boolean(hud.use)} onClick={onUse} dataAct="use" />
      </div>
    </>
  );
}

// ─── El mapa ─────────────────────────────────────────────────────────────────
// `simRef` guarda la posición propia (se lee cada cuadro, así el puntito te sigue).
export function ShipMap({ simRef, color, tasks, sabotage, impostor, cooldown, onSabotage, onClose }) {
  const ref = useRef(null);
  const colorRef = useRef(color);
  colorRef.current = color;
  const sabRef = useRef(sabotage);
  sabRef.current = sabotage;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  useEffect(() => everyFrame(({ hidden }) => {
    const c = ref.current;
    if (!c || hidden) return;
    const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const local = simRef.current.local;
    drawShipMap(c.getContext('2d'), c.width, c.height, {
      me: { x: local.x, y: local.y, color: colorRef.current, facing: local.facing }, tasks: tasksRef.current, sabotage: sabRef.current, now: performance.now() / 1000,
    });
  }), [simRef]);
  const blocked = Boolean(sabotage) || cooldown > 0;
  const pos = (x, y) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` });
  const reactorAt = { x: REACTOR_HANDS[0].x + 5, y: REACTOR_HANDS[0].y + 4 };
  return (
    <div className="nv-mapwrap">
      <button type="button" className="nv-mapclose" onClick={onClose} aria-label="Cerrar el mapa" title="Cerrar (Tab)"><Icon name="close" size={22} /></button>
      <div className="nv-mapbox" data-nave-map>
        <canvas ref={ref} />
        {impostor && (
          <>
            <button type="button" className="nv-sabicon" style={pos(LIGHTS_PANEL.x + 5, LIGHTS_PANEL.y - 7)} disabled={blocked} onClick={() => onSabotage('lights')} title="Apagar las luces" data-sabotage="lights">
              <Icon name="bulb" size={26} />{cooldown > 0 && !sabotage && <b>{Math.ceil(cooldown / 1000)}</b>}
            </button>
            <button type="button" className="nv-sabicon" style={pos(reactorAt.x, reactorAt.y)} disabled={blocked} onClick={() => onSabotage('reactor')} title="Fusión del reactor" data-sabotage="reactor">
              <Icon name="atom" size={26} />{cooldown > 0 && !sabotage && <b>{Math.ceil(cooldown / 1000)}</b>}
            </button>
          </>
        )}
      </div>
      <p className="nv-maphint">{impostor ? (sabotage ? 'Ya hay un sabotaje en marcha.' : cooldown > 0 ? `Podés sabotear en ${Math.ceil(cooldown / 1000)} s.` : 'Tocá un ícono rojo para sabotear.') : 'Podés moverte con el mapa abierto.'}</p>
    </div>
  );
}

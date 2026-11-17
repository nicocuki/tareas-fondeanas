// Juegos Wii: la elección de personaje (los 8 de skins.js). Cada uno se dibuja con CSS (cara, pelo y remera), sin Three.js,
// así se puede usar en el celular y en la sala de espera sin cargar el 3D.
import React from 'react';
import { SKINS } from './skins.js';
import './wii.css';

export function SkinFace({ skin, size = 44 }) {
  return (
    <span className="wii-face" style={{ '--sk': skin.skin, '--hr': skin.hair, '--sh': skin.shirt, '--cp': skin.cap || skin.hair, width: size, height: size }} data-style={skin.style} aria-hidden="true">
      <i className="wii-face-shirt" /><i className="wii-face-head" /><i className="wii-face-hair" />
    </span>
  );
}

export default function SkinPicker({ value, onPick, taken = [], compact = false }) {
  return (
    <div className={`wii-skins${compact ? ' is-compact' : ''}`} role="radiogroup" aria-label="Elegí tu personaje" data-skins>
      {SKINS.map((s) => {
        const busy = taken.includes(s.id) && s.id !== value;
        return (
          <button key={s.id} type="button" role="radio" aria-checked={value === s.id} className={value === s.id ? 'is-on' : ''} disabled={busy} onClick={() => onPick(s.id)} data-skin={s.id} title={busy ? `${s.name} (ya lo eligieron)` : s.name}>
            <SkinFace skin={s} size={compact ? 36 : 48} />
            <span>{s.name}</span>
          </button>
        );
      })}
    </div>
  );
}

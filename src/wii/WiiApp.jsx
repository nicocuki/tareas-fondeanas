// Juegos Wii: un juego con juegos adentro (Tenis Movido y Fondo Kart), con los mismos personajes (skins.js) y el celular
// como control. Cada uno sigue andando solo con su link (`?juego=tenis`, `?juego=kart`), que es lo que traen los QR.
import React, { useState } from 'react';
import GameHero from '../ui/GameHero.jsx';
import { SKINS } from './skins.js';
import { SkinFace } from './SkinPicker.jsx';
import TenisApp from '../tenis/TenisApp.jsx';
import KartApp from '../kart/KartApp.jsx';
import './wii.css';

const INSIDE = [
  { id: 'kart', title: 'Fondo Kart', emoji: '🏎️', image: '/juegos/kart.jpg', badge: 'Nuevo', text: 'Carreras de karts de hasta 8 con derrape y mini turbo, ítems y 5 pistas con saltos, planeador, atajos y obstáculos. Online (cada uno en su compu) o local con la pantalla partida, con el teclado o el celular de volante.', App: KartApp },
  { id: 'tenis', title: 'Tenis Movido', emoji: '🎾', image: '/juegos/tenis.jpg', text: 'La compu muestra la cancha y el celular es la raqueta: hacés el gesto del golpe y la pelota sale. 1 contra 1 o 2 contra 2, local u online.', App: TenisApp },
];

export default function WiiApp({ onBackToMenu }) {
  const [open, setOpen] = useState(null);
  const game = INSIDE.find((g) => g.id === open);
  if (game) return <game.App onBackToMenu={() => { window.history.replaceState(null, '', `${window.location.origin}/?juego=wii`); setOpen(null); }} />;
  return (
    <div className="cs-root wii-page" data-wii>
      <GameHero gameId="wii" onBack={onBackToMenu} />
      <div className="wii-roster" aria-hidden="true">{SKINS.map((s) => <SkinFace key={s.id} skin={s} size={46} />)}</div>
      <div className="wii-grid">
        {INSIDE.map((g) => (
          <button key={g.id} type="button" className="wii-card" onClick={() => setOpen(g.id)} data-wii-game={g.id}>
            <span className="wii-card-img" style={{ backgroundImage: `url(${g.image})` }}>{g.badge && <em>{g.badge}</em>}</span>
            <span className="wii-card-body">
              <b>{g.emoji} {g.title}</b>
              <span>{g.text}</span>
              <span className="wii-play">Jugar ▸</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Mario vs Luigi: la compilación web (Unity WebGL) del juego de ipodtouch0218, tal cual, adentro de
// un iframe. Vive en `public/mvl/` (ver CLAUDE.md, «Mario vs Luigi»). El online es el del juego
// (Photon), con nuestra app y pasando por el Worker; no usa las salas de Tareas Fondeanas.
import React, { useRef } from 'react';
import './mvl.css';

export default function MvlApp({ onBackToMenu }) {
  const frame = useRef(null);
  const fullscreen = () => frame.current?.requestFullscreen?.().catch(() => {});
  return (
    <div className="cs-root mvl-page">
      <div className="mvl-bar">
        <button type="button" className="tf-btn tf-btn-soft" onClick={onBackToMenu}>← Juegos</button>
        <strong>Mario vs Luigi</strong>
        <span className="mvl-spacer" />
        <button type="button" className="tf-btn tf-btn-soft" onClick={fullscreen}>⛶ Pantalla completa</button>
        <a className="tf-btn tf-btn-soft" href="/mvl/" target="_blank" rel="noreferrer">Abrir aparte ↗</a>
      </div>
      <iframe
        ref={frame}
        className="mvl-frame"
        src="/mvl/"
        title="Mario vs Luigi"
        allow="fullscreen; autoplay; gamepad"
        allowFullScreen
        onLoad={() => frame.current?.focus()}
      />
      <p className="mvl-note">
        Controles: <kbd>WASD</kbd> o flechas · saltar <kbd>Espacio</kbd> · correr <kbd>Shift</kbd> · poder <kbd>E</kbd> · reserva <kbd>Q</kbd> · puntajes <kbd>Tab</kbd>.
        Para jugar online creá o entrá a una sala desde el menú del juego. Juego de{' '}
        <a href="https://github.com/ipodtouch0218/NSMB-MarioVsLuigi" target="_blank" rel="noreferrer">ipodtouch0218 y colaboradores</a>.
      </p>
    </div>
  );
}

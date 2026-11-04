// Arena Royale: piezas de interfaz dibujadas (sin emojis): el arte de cada carta, el marco con su gota de elixir,
// la corona y la gota. Los dibujos de las cartas son los de sprites.js, los mismos que se ven en la arena.
import React, { useEffect, useRef } from 'react';
import { CARD_BY_ID } from './cards.js';
import { drawCardArt } from './sprites.js';

export function CardArt({ id, width = 80, height = 100, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const card = CARD_BY_ID[id];
    if (!canvas || !card) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = canvas.width / width;
    ctx.scale(k, k);
    drawCardArt(ctx, card, width, height, 0);
  }, [id, width, height]);
  return <canvas ref={ref} className={`ar-art ${className}`} width={width * 2} height={height * 2} style={{ width, height }} aria-hidden="true" />;
}

// La gota de elixir, con un número adentro si se lo das.
export function Drop({ n, size = 28, className = '' }) {
  return (
    <svg className={`ar-drop ${className}`} width={size} height={size * 1.2} viewBox="0 0 32 38" aria-hidden="true">
      <defs>
        <linearGradient id="ar-drop-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e58bff" /><stop offset="1" stopColor="#9a2fe0" /></linearGradient>
      </defs>
      <path d="M16 2 C16 2 4 17 4 25 a12 12 0 0 0 24 0 C28 17 16 2 16 2 Z" fill="url(#ar-drop-g)" stroke="#3d1459" strokeWidth="2.2" strokeLinejoin="round" />
      <ellipse cx="11" cy="22" rx="2.6" ry="4.5" fill="rgba(255,255,255,0.45)" transform="rotate(18 11 22)" />
      {n !== undefined && <text x="16" y="29.5" textAnchor="middle" fontSize="17" fontWeight="900" fill="#fff" stroke="#3d1459" strokeWidth="2.6" paintOrder="stroke" fontFamily="sans-serif">{n}</text>}
    </svg>
  );
}

export function Crown({ color = '#f5c518', size = 24, className = '' }) {
  return (
    <svg className={`ar-crown ${className}`} width={size} height={size} viewBox="0 0 32 28" aria-hidden="true">
      <path d="M3 24 L1.5 7 L10 14 L16 3 L22 14 L30.5 7 L29 24 Z" fill={color} stroke="#2b1a14" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="16" cy="18" r="2.2" fill="#e0443a" stroke="#2b1a14" strokeWidth="1" />
      <path d="M6 21 H26" stroke="rgba(255,255,255,0.5)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// El marco de una carta (como las del original): el color del borde es la rareza, la gota arriba a la izquierda es el costo.
export function CardFrame({
  id, small = false, selected = false, poor = false, disabled = false, pressed, onClick, onHover, kbd, ...rest
}) {
  const card = CARD_BY_ID[id];
  if (!card) return null;
  const w = small ? 62 : 72;
  const h = small ? 76 : 90;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined} className={`ar-fr r-${card.rarity} ${small ? 'is-small' : ''} ${selected ? 'is-sel' : ''} ${poor ? 'is-poor' : ''}`}
      disabled={onClick ? disabled : undefined} aria-pressed={onClick ? pressed : undefined} onClick={onClick}
      onMouseEnter={onHover} onFocus={onHover} title={`${card.name}: ${card.desc}`} {...rest}
    >
      <span className="ar-fr-art"><CardArt id={id} width={w} height={h} /></span>
      <Drop n={card.cost} size={small ? 22 : 26} className="ar-fr-cost" />
      <span className="ar-fr-name">{card.name}</span>
      {kbd && <kbd>{kbd}</kbd>}
    </Tag>
  );
}

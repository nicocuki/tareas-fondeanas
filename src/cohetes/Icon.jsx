// Ícono de Cohete Royale (objeto, calavera, moneda…) dibujado en un canvas chico: ver icons.js.
import React, { useEffect, useRef } from 'react';
import { iconSprite } from './icons.js';

export default function Icon({ name, size = 24, className = '' }) {
  const ref = useRef(null);
  const px = Math.round(size * 2);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(iconSprite(name, px), 0, 0);
  }, [name, px]);
  return <canvas ref={ref} width={px} height={px} className={`ck-ico ${className}`} style={{ width: size, height: size }} aria-hidden="true" />;
}

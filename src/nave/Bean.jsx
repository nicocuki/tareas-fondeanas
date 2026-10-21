// El poroto con visor en SVG, para las pantallas de React (el del canvas está en render.js).
import React from 'react';
import { shade } from './render.js';

export default function Bean({ color, size = 48, dead = false, ghost = false, flip = false, className = '', title }) {
  const dark = shade(color, -0.4);
  return (
    <svg className={className} width={size} height={size} viewBox="-0.85 -1.6 1.7 2.05" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}
      style={{ transform: flip ? 'scaleX(-1)' : undefined, opacity: ghost ? 0.5 : 1, overflow: 'visible' }}>
      <g stroke="#0b0d12" strokeWidth="0.08" strokeLinejoin="round">
        {dead ? (
          <>
            <rect x="-0.42" y="-0.1" width="0.36" height="0.42" rx="0.14" fill={color} />
            <rect x="0.06" y="-0.1" width="0.36" height="0.42" rx="0.14" fill={color} />
            <path d="M-0.48 -0.05 L-0.48 -0.5 L-0.3 -0.42 L-0.15 -0.55 L0.05 -0.43 L0.22 -0.56 L0.48 -0.45 L0.48 -0.05 Q0.48 0.08 0.3 0.08 L-0.3 0.08 Q-0.48 0.08 -0.48 -0.05 Z" fill={color} />
            <g stroke="none" fill="#f2efe6"><rect x="-0.05" y="-0.95" width="0.12" height="0.5" /><circle cx="-0.04" cy="-0.98" r="0.1" /><circle cx="0.08" cy="-0.98" r="0.1" /></g>
          </>
        ) : (
          <>
            <rect x="-0.72" y="-0.95" width="0.34" height="0.78" rx="0.14" fill={dark} />
            {!ghost && <rect x="-0.42" y="-0.15" width="0.36" height="0.48" rx="0.14" fill={color} />}
            {!ghost && <rect x="0.06" y="-0.15" width="0.36" height="0.48" rx="0.14" fill={color} />}
            <path d={ghost
              ? 'M-0.48 -0.1 L-0.48 -0.95 C-0.48 -1.55 0.48 -1.55 0.48 -0.95 L0.48 0.1 Q0.36 0.25 0.24 0.1 Q0.12 -0.05 0 0.1 Q-0.12 0.25 -0.24 0.1 Q-0.36 -0.05 -0.48 0.1 Z'
              : 'M-0.48 -0.1 L-0.48 -0.95 C-0.48 -1.55 0.48 -1.55 0.48 -0.95 L0.48 -0.1 Q0.48 0.05 0.3 0.05 L-0.3 0.05 Q-0.48 0.05 -0.48 -0.1 Z'} fill={color} />
            <ellipse cx="0.16" cy="-0.95" rx="0.34" ry="0.21" fill="#93c9da" />
            <ellipse cx="0.26" cy="-1.02" rx="0.14" ry="0.07" fill="#d9f3fb" stroke="none" />
          </>
        )}
      </g>
    </svg>
  );
}

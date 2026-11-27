// El poroto con visor en SVG, para las pantallas de React (el del canvas está en render.js y se ve igual).
// `motion`: 'walk' camina en el lugar, 'idle' respira. Las animaciones están en nave.css (.bean-*).
import React, { useId } from 'react';
import { shade } from './render.js';

export default function Bean({ color, size = 48, dead = false, ghost = false, flip = false, motion = '', className = '', title }) {
  const dark = shade(color, -0.4);
  const light = shade(color, 0.4);
  const uid = useId().replace(/:/g, '');
  const body = ghost
    ? 'M-0.5 -0.1 L-0.5 -0.98 C-0.5 -1.62 0.5 -1.62 0.5 -0.98 L0.5 0.1 Q0.375 0.28 0.25 0.1 Q0.125 -0.06 0 0.1 Q-0.125 0.28 -0.25 0.1 Q-0.375 -0.06 -0.5 0.1 Z'
    : 'M-0.5 -0.1 L-0.5 -0.98 C-0.5 -1.62 0.5 -1.62 0.5 -0.98 L0.5 -0.1 Q0.5 0.06 0.32 0.06 L-0.32 0.06 Q-0.5 0.06 -0.5 -0.1 Z';
  return (
    <svg className={`bean${motion ? ` bean-${motion}` : ''} ${className}`} width={size} height={size} viewBox="-0.9 -1.72 1.8 2.2" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}
      style={{ transform: flip ? 'scaleX(-1)' : undefined, opacity: ghost ? 0.55 : 1, overflow: 'visible' }}>
      <defs>
        <linearGradient id={`v${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4f0ff" /><stop offset="0.55" stopColor="#7fc4dc" /><stop offset="1" stopColor="#3f7f98" />
        </linearGradient>
        <clipPath id={`c${uid}`}><path d={body} /></clipPath>
      </defs>
      <ellipse className="bean-shadow" cx="0" cy="0.34" rx="0.58" ry="0.17" fill="rgba(0,0,0,0.3)" />
      <g className="bean-body" stroke="#0b0d12" strokeWidth="0.1" strokeLinejoin="round">
        {dead ? (
          <>
            <rect x="-0.44" y="-0.1" width="0.38" height="0.44" rx="0.15" fill={color} />
            <rect x="0.07" y="-0.1" width="0.38" height="0.44" rx="0.15" fill={color} />
            <rect x="-0.76" y="-0.5" width="0.34" height="0.5" rx="0.14" fill={dark} />
            <path d="M-0.5 -0.05 L-0.5 -0.52 L-0.3 -0.43 L-0.15 -0.58 L0.05 -0.44 L0.22 -0.59 L0.5 -0.46 L0.5 -0.05 Q0.5 0.09 0.32 0.09 L-0.32 0.09 Q-0.5 0.09 -0.5 -0.05 Z" fill={color} />
            <g stroke="#0b0d12" strokeWidth="0.05" fill="#f4f0e4"><rect x="-0.06" y="-1" width="0.14" height="0.56" /><circle cx="-0.05" cy="-1.03" r="0.11" /><circle cx="0.09" cy="-1.03" r="0.11" /></g>
          </>
        ) : (
          <>
            <rect x="-0.76" y="-1" width="0.36" height="0.84" rx="0.15" fill={dark} />
            <rect x="-0.7" y="-0.94" width="0.14" height="0.7" rx="0.07" fill={shade(color, -0.15)} stroke="none" />
            {!ghost && <rect className="bean-leg bean-leg-a" x="-0.44" y="-0.16" width="0.38" height="0.5" rx="0.15" fill={color} />}
            {!ghost && <rect className="bean-leg bean-leg-b" x="0.07" y="-0.16" width="0.38" height="0.5" rx="0.15" fill={color} />}
            <path d={body} fill={color} />
            <g clipPath={`url(#c${uid})`} stroke="none">
              <ellipse cx="-0.6" cy="-0.5" rx="0.34" ry="0.95" fill={dark} opacity="0.5" />
              <ellipse cx="0" cy="0.2" rx="0.6" ry="0.22" fill={dark} opacity="0.5" />
              <ellipse cx="-0.1" cy="-1.36" rx="0.3" ry="0.12" fill={light} opacity="0.55" transform="rotate(-20 -0.1 -1.36)" />
            </g>
            <path d={body} fill="none" />
            <ellipse cx="0.17" cy="-0.96" rx="0.36" ry="0.23" fill={`url(#v${uid})`} />
            <ellipse cx="0.28" cy="-1.05" rx="0.14" ry="0.065" fill="rgba(255,255,255,0.85)" stroke="none" transform="rotate(-11 0.28 -1.05)" />
            <ellipse cx="0.05" cy="-0.86" rx="0.1" ry="0.035" fill="rgba(255,255,255,0.4)" stroke="none" />
          </>
        )}
      </g>
    </svg>
  );
}

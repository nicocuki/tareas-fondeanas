// Íconos de Trazo Loco, dibujados con trazo grueso como los de Gartic Phone.
import React from 'react';

const PATHS = {
  pencil: <><path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" /><path d="M13.5 7l3.5 3.5" /></>,
  eraser: <><path d="M8.5 19.5L3.8 14.8a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l5.4 5.4a2 2 0 0 1 0 2.8l-7.6 7.3z" /><path d="M8.5 9.5l6 6M8.5 19.5H20" /></>,
  rect: <rect x="4" y="5" width="16" height="14" rx="1.5" />,
  ellipse: <circle cx="12" cy="12" r="8" />,
  filledRect: <rect x="4" y="5" width="16" height="14" rx="1.5" fill="currentColor" />,
  filledEllipse: <circle cx="12" cy="12" r="8" fill="currentColor" />,
  line: <><path d="M5 19L19 5" /><circle cx="5" cy="19" r="1.6" fill="currentColor" /><circle cx="19" cy="5" r="1.6" fill="currentColor" /></>,
  bucket: <><path d="M5 11l6.5-6.5 7 7L12 18a2 2 0 0 1-2.8 0L5 13.8a2 2 0 0 1 0-2.8z" /><path d="M5.5 11.5h12.5M20 15s1.6 2 1.6 3.1a1.6 1.6 0 0 1-3.2 0C18.4 17 20 15 20 15z" /></>,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  redo: <><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  trash: <><path d="M4 7h16M10 7V4.5h4V7M6.5 7l1 13h9l1-13" /><path d="M10 11v5M14 11v5" /></>,
  clock: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4.5l3 2M9.5 2.5h5" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  crown: <path d="M4 18h16l1-10-5 4-4-7-4 7-5-4z" fill="currentColor" />,
  back: <path d="M15 5l-7 7 7 7" />,
  forward: <path d="M9 5l7 7-7 7" />,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  play: <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />,
  pause: <><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" /></>,
  next: <><path d="M6 5l7 7-7 7" /><path d="M14 5l7 7-7 7" /></>,
  prev: <><path d="M18 5l-7 7 7 7" /><path d="M10 5l-7 7 7 7" /></>,
  album: <><rect x="4" y="3.5" width="15" height="17" rx="2" /><path d="M8 3.5v17M11.5 9h4" /></>,
  home: <path d="M4 11l8-7 8 7v9h-5.5v-5.5h-5V20H4z" fill="currentColor" />,
  download: <><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></>,
};

export default function Icon({ name, size = 24 }) {
  return (
    <svg className="gp-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// El ranking global de Abismo (GET /api/abismo/ranking): quién dijo más cosas nicho, la mejor inmersión y la
// vitrina de perlas (las respuestas Abisal y Uno en un millón más recientes). Se guarda en el servidor por nombre.
import React, { useEffect, useState } from 'react';
import { PROMPT_BY_ID } from './prompts.js';
import { fmtDepth, depthOf, tierById } from './tiers.js';

export async function fetchRanking() {
  const res = await fetch('/api/abismo/ranking', { cache: 'no-store' });
  if (!res.ok) throw new Error('ranking');
  return res.json();
}

const TABS = [
  { id: 'niche', label: 'Más nichos' },
  { id: 'best', label: 'Mejor inmersión' },
  { id: 'perlas', label: 'Perlas' },
];

export default function Ranking({ highlight, compact }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState('niche');
  useEffect(() => {
    let alive = true;
    fetchRanking().then((d) => alive && setData(d)).catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);
  const medals = ['🥇', '🥈', '🥉'];
  const mine = (name) => highlight && name && name.trim().toLowerCase() === highlight.trim().toLowerCase();
  return (
    <div className={`ab-rank${compact ? ' is-compact' : ''}`} data-ranking>
      <div className="ab-rank-tabs" role="tablist">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {error && <p className="ab-rank-empty">No se pudo cargar el ranking.</p>}
      {!data && !error && <p className="ab-rank-empty">Cargando…</p>}
      {data && tab !== 'perlas' && (
        data[tab]?.length ? (
          <ol className="ab-rank-list">
            {data[tab].map((p, i) => (
              <li key={`${p.name}-${i}`} className={mine(p.name) ? 'is-me' : ''}>
                <span className="ab-rank-place">{medals[i] || `${i + 1}.`}</span>
                <span className="ab-rank-name">{p.avatar} {p.name}</span>
                {tab === 'niche'
                  ? <span className="ab-rank-val"><b>{p.niche}</b> nicho{p.niche === 1 ? '' : 's'}{p.krill ? <small> · {p.krill} 🦐</small> : null}</span>
                  : <span className="ab-rank-val"><b>{fmtDepth(depthOf(p.best))}</b><small> · {p.best} pts</small></span>}
                <small className="ab-rank-games">{p.games} {p.games === 1 ? 'partida' : 'partidas'}</small>
              </li>
            ))}
          </ol>
        ) : <p className="ab-rank-empty">Todavía no se anotó nadie. Sumergite y estrenalo.</p>
      )}
      {data && tab === 'perlas' && (
        data.perlas?.length ? (
          <ul className="ab-rank-pearls">
            {data.perlas.map((x, i) => {
              const t = tierById(x.tier);
              return (
                <li key={`${x.at}-${i}`} style={{ '--tc': t?.color }} className={mine(x.name) ? 'is-me' : ''}>
                  <b>«{x.text}»</b>
                  <span>{PROMPT_BY_ID[x.promptId]?.text || '…'}</span>
                  <small>{t?.icon} {t?.name} · {x.avatar} {x.name}</small>
                </li>
              );
            })}
          </ul>
        ) : <p className="ab-rank-empty">Ninguna perla todavía: hace falta una respuesta Abisal o Uno en un millón.</p>
      )}
    </div>
  );
}

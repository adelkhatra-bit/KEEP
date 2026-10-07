import React, { useEffect, useRef, useState } from 'react';

/**
 * Courbes et barres du Super Admin (07/10/2026) : SVG pur, aucune librairie, lisible en clair sur fond sombre.
 * Une seule implémentation réutilisée par l'Accueil (et toute future page) : pas de doublon de graphiques.
 */
export type Series = { label: string; color: string; values: number[] };

export function LineChart({ dates, series, height = 180 }: { dates: string[]; series: Series[]; height?: number }) {
  // Largeur réelle mesurée : le texte des axes garde sa taille sur téléphone comme sur ordinateur (jamais écrasé).
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = box.current; if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(260, Math.round(entry.contentRect.width))));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const h = height; const padL = 28; const padB = 22; const padT = 10;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const n = Math.max(1, dates.length - 1);
  const x = (i: number) => padL + (i / n) * (w - padL - 8);
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB);
  const ticks = [0, Math.round(max / 2), max];
  const labelEvery = Math.max(1, Math.ceil(dates.length / Math.max(3, Math.floor(w / 90))));
  return (
    <div className="chart" ref={box}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={series.map((s) => s.label).join(', ')} style={{ display: 'block', maxWidth: '100%' }}>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={w - 8} y1={y(t)} y2={y(t)} stroke="#2a2140" /><text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#aaa5c4">{t}</text></g>)}
        {dates.map((d, i) => (i % labelEvery === 0 || i === dates.length - 1) ? <text key={d} x={x(i)} y={h - 6} textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'} fontSize="10" fill="#aaa5c4">{new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}</text> : null)}
        {series.map((s) => <g key={s.label}>
          <polyline fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
          {s.values.length <= 31 && s.values.map((v, i) => v > 0 ? <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color}><title>{`${s.label} · ${dates[i]} : ${v}`}</title></circle> : null)}
        </g>)}
      </svg>
      <div className="chart-legend">{series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label} · {s.values.reduce((a, b) => a + b, 0)}</span>)}</div>
    </div>
  );
}

export function Bars({ rows, color = '#a78bfa', empty = 'Aucune donnée.' }: { rows: Array<{ label: string; value: number }>; color?: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="na" style={{ padding: '8px 0' }}>{empty}</div>;
  return (
    <div className="bars">
      {rows.map((r) => <div key={r.label} className="bar-row">
        <span className="bar-label">{r.label}</span>
        <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: color }} /></span>
        <strong className="bar-value">{r.value}</strong>
      </div>)}
    </div>
  );
}

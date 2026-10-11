import React, { useState } from 'react';
import { Sheet } from './Hint';

/**
 * Super Admin « zéro clavier » (Adel, 07/10/2026) : chaque valeur se choisit dans une liste déjà remplie.
 * Le clavier n'apparaît qu'en dernier recours, si Adel choisit « Autre… ». Composant UNIQUE, réutilisé par toutes les pages
 * (aucun doublon par page). `null` = illimité (∞) quand `allowUnlimited` est vrai.
 */
export type PresetValue = number | null;

export const PRESETS = {
  /** Paliers de prix Apple courants (EUR). */
  priceEur: [0, 0.99, 1.99, 2.99, 3.99, 4.99, 5.99, 6.99, 7.99, 9.99, 14.99, 19.99, 24.99, 29.99, 39.99, 49.99, 59.99, 99.99],
  freeBonus: [0, 5, 10, 20, 30, 50, 100, 200],
  trialDays: [0, 3, 7, 14, 30],
  guestListens: [0, 3, 5, 10, 20, 50],
  signupBonus: [0, 10, 20, 30, 50, 100],
  limit: [0, 1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 500, 1000],
  creditAdjust: [-50, -20, -10, -5, 5, 10, 20, 30, 50, 100],
  followers: [100, 500, 1000, 5000, 10000],
  costEur: [5, 10, 20, 50, 100, 200, 500, 1000],
} as const;

const OTHER = '__other__';
const UNLIMITED = '__unlimited__';

function keyOf(v: PresetValue): string {
  return v == null ? UNLIMITED : String(v);
}

export default function PresetPicker({
  value,
  presets,
  onChange,
  format = (v) => String(v),
  allowUnlimited = false,
  allowNegative = false,
  unlimitedLabel = '∞ illimité',
  width = 110,
  label,
  impact,
}: {
  value: PresetValue;
  presets: readonly number[];
  onChange: (next: PresetValue) => void;
  format?: (v: number) => string;
  allowUnlimited?: boolean;
  allowNegative?: boolean;
  unlimitedLabel?: string;
  width?: number;
  label?: string;
  /** Ce que le changement fait concrètement aux utilisateurs. Présent → fenêtre de confirmation avant/après (règle Adel 07/10/2026). */
  impact?: string | ((next: PresetValue) => string);
}) {
  const [other, setOther] = useState(false);
  const [pending, setPending] = useState<{ next: PresetValue } | null>(null);
  const show = (v: PresetValue) => (v == null ? unlimitedLabel : format(v));
  const request = (next: PresetValue) => {
    if (next === value) return;
    if (impact) setPending({ next }); else onChange(next);
  };
  const confirmSheet = pending && (
    <Sheet title={label ?? 'Modifier'} onClose={() => setPending(null)}
      actions={<>
        <button type="button" className="btn" onClick={() => setPending(null)}>Annuler</button>
        <button type="button" className="btn btn-primary" onClick={() => { onChange(pending.next); setPending(null); }}>Valider</button>
      </>}>
      <div className="change-row"><span className="change-old">{show(value)}</span><span aria-hidden>→</span><span className="change-new">{show(pending.next)}</span></div>
      <p style={{ margin: '12px 0 0' }}>{typeof impact === 'function' ? impact(pending.next) : impact}</p>
      <p className="muted-note">Rien n’est envoyé aux utilisateurs tant que tu n’appuies pas sur « Enregistrer ».</p>
    </Sheet>
  );
  const inPresets = value == null ? allowUnlimited : presets.includes(value);
  const current = keyOf(value);

  if (other) {
    return (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <input
          type="number"
          min={allowNegative ? undefined : 0}
          step="0.01"
          autoFocus
          aria-label={label ? `${label} (autre valeur)` : 'Autre valeur'}
          defaultValue={value == null ? '' : value}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            if (raw === '' && allowUnlimited) request(null);
            else if (raw !== '' && Number.isFinite(Number(raw))) request(allowNegative ? Number(raw) : Math.max(0, Number(raw)));
            setOther(false);
          }}
          style={{ width }}
        />
        <button type="button" className="btn" onClick={() => setOther(false)} aria-label="Revenir à la liste">✓</button>
        {confirmSheet}
      </span>
    );
  }

  return (<>
    <select
      aria-label={label}
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        if (v === OTHER) { setOther(true); return; }
        request(v === UNLIMITED ? null : Number(v));
      }}
      style={{ width, padding: '6px 8px', borderRadius: 8, background: '#1b1422', color: '#fff', border: '1px solid #3c2d55' }}
    >
      {allowUnlimited && <option value={UNLIMITED}>{unlimitedLabel}</option>}
      {!inPresets && value != null && <option value={current}>{format(value)}</option>}
      {presets.map((p) => <option key={p} value={String(p)}>{format(p)}</option>)}
      <option value={OTHER}>Autre…</option>
    </select>
    {confirmSheet}
  </>);
}

export const formatEur = (v: number) => (v === 0 ? 'Gratuit' : `${v.toFixed(2).replace('.', ',')} €`);
export const formatFree = (v: number) => `${v} FREE`;
export const formatDays = (v: number) => (v === 0 ? 'Aucun' : `${v} j`);

/** Même principe pour un texte : une liste de phrases prêtes, « Autre… » seulement en dernier recours. */
export function TextChoicePicker({ value, choices, onChange, width = 260, label, otherPlaceholder = 'Autre…' }: {
  value: string;
  choices: readonly string[];
  onChange: (next: string) => void;
  width?: number;
  label?: string;
  otherPlaceholder?: string;
}) {
  const [other, setOther] = useState(false);
  const known = value === '' || choices.includes(value);
  if (other) {
    return (
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
        <input autoFocus aria-label={label ? `${label} (autre)` : 'Autre'} defaultValue={value} placeholder={otherPlaceholder}
          onBlur={(e) => { onChange(e.target.value.trim()); setOther(false); }} style={{ width }} />
        <button type="button" className="btn" onClick={() => setOther(false)} aria-label="Revenir à la liste">✓</button>
      </span>
    );
  }
  return (
    <select aria-label={label} value={known ? value : '__current__'}
      onChange={(e) => { const v = e.target.value; if (v === OTHER) { setOther(true); return; } onChange(v === '__current__' ? value : v); }}
      style={{ width, padding: '6px 8px', borderRadius: 8, background: '#1b1422', color: '#fff', border: '1px solid #3c2d55' }}>
      <option value="">—</option>
      {!known && <option value="__current__">{value}</option>}
      {choices.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={OTHER}>Autre…</option>
    </select>
  );
}

/** Période en un geste (tableau de bord, comptabilité) : plus besoin de taper des dates. */
export function periodRange(days: number | 'month' | 'year'): { from: string; to: string } {
  const now = new Date();
  // Date locale (pas UTC) : sinon « Ce mois » démarrerait la veille à Paris.
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (days === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (days === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
  const start = new Date(now); start.setDate(now.getDate() - (days - 1));
  return { from: iso(start), to: iso(now) };
}

export function PeriodButtons({ from, to, onPick }: { from: string; to: string; onPick: (range: { from: string; to: string }) => void }) {
  const options: Array<[string, number | 'month' | 'year']> = [['Aujourd’hui', 1], ['7 j', 7], ['30 j', 30], ['Ce mois', 'month'], ['90 j', 90], ['Cette année', 'year']];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([text, d]) => {
        const r = periodRange(d);
        const active = r.from === from && r.to === to;
        return <button key={text} type="button" className="btn" onClick={() => onPick(r)} aria-pressed={active}
          style={{ background: active ? 'var(--primary)' : undefined, color: active ? '#fff' : undefined }}>{text}</button>;
      })}
    </div>
  );
}

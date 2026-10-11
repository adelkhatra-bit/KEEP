import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

/**
 * Robot du Super Admin (Adel, 07/10/2026) : 3 clics rapprochés sur une zone vide (ou le bouton 🤖) ouvrent une fenêtre
 * qui dit où l'on est en une phrase, puis propose TOUJOURS 3 destinations + « Autre ». Chaque bouton est un lien du menu
 * lui-même (catalogue unique = le menu) : aucun bouton ne peut mener à une page qui n'existe pas.
 * Anti-bug : les clics sur un champ, une liste, un bouton ou un lien ne comptent pas ; une seule fenêtre à la fois ;
 * pause de 2 s après fermeture ; Échap ferme.
 */
export type RobotPage = { href: string; label: string; group: string };

/** Une phrase par page, 12 mots maximum. Une page absente garde un texte générique (jamais de bouton cassé). */
export const ROBOT_HELP: Record<string, string> = {
  '/': 'Les chiffres du jour : inscrits, payants, offerts, écoutes.',
  '/users': 'Chercher un compte, offrir des FREE, vérifier un e-mail.',
  '/moderation': 'Valider ou refuser les soirées et photos proposées.',
  '/community': 'Mots interdits et signalements du tchat.',
  '/problem-reports': 'Les secousses et bugs envoyés par les utilisateurs.',
  '/support-center': 'Répondre aux messages des utilisateurs.',
  '/messages': 'Envoyer une notification à tous ou à quelques-uns.',
  '/notification-access': 'Choisir quelles notifications sont gratuites ou réservées.',
  '/plans': 'Prix des formules, FREE offerts et quotas.',
  '/costs': 'Revenus et coûts, séparés par pays et devise.',
  '/marketplace': 'Ventes de playlists et de billets.',
  '/music-brain': 'Styles, Vibes et rangement automatique de la musique.',
  '/integrations': 'Coller et contrôler les clés des services.',
  '/email-test': 'Envoyer un e-mail de test.',
  '/operations': 'Santé et coût des services payants.',
  '/launch-center': 'Liste de contrôle avant lancement.',
  '/feature-flags': 'Allumer ou éteindre une fonction.',
  '/remote-config': 'Textes et quotas modifiables sans mise à jour.',
  '/team': 'Rôles de l’équipe et mot de passe.',
};

const TAP_WINDOW_MS = 1200;
const TAP_RADIUS_PX = 60;
const COOLDOWN_MS = 2000;

function isInteractive(el: EventTarget | null): boolean {
  if (!(el instanceof Element)) return false;
  return Boolean(el.closest('input, select, textarea, button, a, label, summary, [role="button"], [contenteditable="true"]'));
}

export default function AdminRobot({ pages, currentPath }: { pages: RobotPage[]; currentPath: string }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const taps = useRef<Array<{ t: number; x: number; y: number }>>([]);
  const closedAt = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onDown = (e: PointerEvent) => {
      if (open || isInteractive(e.target) || Date.now() - closedAt.current < COOLDOWN_MS) return;
      const now = Date.now();
      const first = taps.current[0];
      if (first && (now - first.t > TAP_WINDOW_MS || Math.hypot(e.clientX - first.x, e.clientY - first.y) > TAP_RADIUS_PX)) taps.current = [];
      taps.current.push({ t: now, x: e.clientX, y: e.clientY });
      if (taps.current.length >= 3) { taps.current = []; setOffset(0); setOpen(true); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open]);

  const close = () => { setOpen(false); closedAt.current = Date.now(); };

  const here = pages.find((p) => p.href === currentPath);
  // Ordre : d'abord les pages de la même rubrique, puis les autres ; jamais la page actuelle.
  const ordered = useMemo(() => {
    const others = pages.filter((p) => p.href !== currentPath);
    const same = others.filter((p) => here && p.group === here.group);
    const rest = others.filter((p) => !same.includes(p));
    return [...same, ...rest];
  }, [pages, currentPath, here]);
  const shown = ordered.length ? Array.from({ length: Math.min(3, ordered.length) }, (_, i) => ordered[(offset + i) % ordered.length]) : [];

  return <>
    <button type="button" className="btn" onClick={() => { setOffset(0); setOpen(true); }} aria-label="Ouvrir le robot d’aide (ou 3 clics sur une zone vide)"
      style={{ position: 'fixed', right: 16, bottom: 64, zIndex: 60, width: 48, height: 48, borderRadius: 24, fontSize: 22 }}>🤖</button>
    {open && (
      <div role="dialog" aria-modal="true" aria-label="Robot d’aide" onClick={close}
        style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div onClick={(e) => e.stopPropagation()} className="card"
          style={{ width: 'min(440px, 100vw - 24px)', margin: '12px 12px 56px', maxHeight: '80vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 18 }}>🤖 {here ? here.label : 'Super Admin'}</strong>
            <button type="button" className="btn" onClick={close} aria-label="Fermer" style={{ marginLeft: 'auto' }}>✕</button>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: '6px 0 12px' }}>{ROBOT_HELP[currentPath] ?? 'Choisis où aller.'}</p>
          <div style={{ display: 'grid', gap: 8 }}>
            {shown.map((p) => (
              <Link key={p.href} href={p.href} onClick={close} className="btn" style={{ display: 'block', textAlign: 'left', textDecoration: 'none', padding: '10px 12px' }}>
                <strong>{p.label}</strong>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{ROBOT_HELP[p.href] ?? p.group}</div>
              </Link>
            ))}
            {ordered.length > 3 && <button type="button" className="btn" onClick={() => setOffset((o) => (o + 3) % ordered.length)}>Autre ›</button>}
          </div>
        </div>
      </div>
    )}
  </>;
}

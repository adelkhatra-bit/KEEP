#!/usr/bin/env node
// Robot de parcours KEEP — tchat, boutique, paiement.
//
// Sert un export web (DIST, défaut packages/mobile/dist-journeys) sous /KEEP,
// branche un faux Supabase 100 % synthétique (fake-supabase.cjs) et rejoue
// les parcours utilisateur dans un vrai Chromium, sur plusieurs tailles
// d'écran. Écrit artifacts/journeys/RAPPORT.md (en français) + captures et
// sort en code 1 si un seul parcours échoue.
//
// Aucun appel au vrai Supabase, aucune écriture en production, aucun
// déploiement : tout le réseau Supabase est intercepté par page.route().
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const fake = require('./fake-supabase.cjs');

function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return require(name); } catch { /* essai suivant */ }
  }
  throw new Error('Module playwright introuvable : installer playwright ou playwright-core (npm install --no-save playwright).');
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DIST = path.resolve(process.argv[2] || process.env.DIST || path.join(REPO_ROOT, 'packages', 'mobile', 'dist-journeys'));
const OUT_DIR = path.resolve(process.env.JOURNEYS_OUT || path.join(REPO_ROOT, 'artifacts', 'journeys'));
const PORT = Number(process.env.JOURNEYS_PORT || 4721);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BASE = `${ORIGIN}/KEEP`;

const PC = ['PC 1440x900', { width: 1440, height: 900 }];
const ANDROID = ['Android 390x844', { width: 390, height: 844 }];
const PETIT = ['Petit écran 360x640', { width: 360, height: 640 }];
const MOBILE_SE = ['Mobile 375x667', { width: 375, height: 667 }];

const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\W+/g, '_').replace(/^_|_$/g, '');

// ---------------------------------------------------------------- serveur
function startServer() {
  const types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    let url;
    try { url = decodeURIComponent(req.url.split('?')[0]); } catch { url = '/'; }
    if (url === '/KEEP/version.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"sha":"robot-parcours"}'); }
    let file = path.join(DIST, url.replace(/^\/KEEP/, '') || '/');
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

// ---------------------------------------------------------------- outils
async function openPage(browser, viewport, fakeOptions, { mobileFlags }) {
  const sb = fake.createFakeSupabase({ origin: ORIGIN, ...fakeOptions });
  const ctxOptions = { viewport };
  if (mobileFlags) Object.assign(ctxOptions, { isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const ctx = await browser.newContext(ctxOptions);
  await ctx.addInitScript(([k, v]) => {
    try { localStorage.setItem(k, v); localStorage.setItem('keep_has_seen_onboarding_guide', 'true'); } catch { /* stockage indisponible */ }
  }, [fake.AUTH_STORAGE_KEY, JSON.stringify(sb.session)]);
  if (fakeOptions?.pcSession) {
    await ctx.addInitScript(() => localStorage.setItem('loki:web-companion-session', 'pc-e2e-1'));
  }
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));
  // Garde-fou : rien ne sort vers Internet. Supabase est servi par le faux
  // backend ; toute autre adresse externe (API KEEP, tiers) est coupée et
  // notée dans le rapport, pour qu'aucun parcours ne touche la production.
  const blocked = [];
  await page.route((url) => !url.href.startsWith(ORIGIN), (route) => {
    const url = route.request().url();
    if (/supabase\.co/.test(new URL(url).hostname)) return sb.respond(route);
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blocked.push(url.slice(0, 120));
    return route.abort();
  });
  return { ctx, page, sb, pageErrors, blocked };
}

async function openGroup(page) {
  await page.getByText('Passer', { exact: true }).first().click({ timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(800);
  const open = page.locator('[aria-label="Ouvrir le Tchat"], [aria-label="Activer et ouvrir le Tchat"]').first();
  await open.waitFor({ timeout: 40000 });
  await open.click({ force: true });
  await page.getByText(fake.GROUP_NAME).first().waitFor({ timeout: 20000 });
}

async function enterGroup(page) {
  await openGroup(page);
  await page.getByText(fake.GROUP_NAME).first().click();
  await page.waitForTimeout(1200);
}

// Chaque vérification : [libellé français, condition booléenne].
const failed = (checks) => checks.filter(([, ok]) => !ok).map(([label]) => label);

// ---------------------------------------------------------------- parcours
function popupJourney(mode) {
  const titre = mode === 'FREE' ? 'Fenêtre d’écoute — achat en FREE' : 'Fenêtre d’écoute — achat en €';
  return {
    id: `fenetre-ecoute-${mode === 'FREE' ? 'free' : 'euro'}`,
    titre,
    devices: [PC, ANDROID, PETIT],
    mobileFlags: false,
    fakeOptions: { mode, offers: 'single' },
    async run({ page, viewport, shot }) {
      const r = {};
      await page.goto(`${BASE}/profile/${fake.SELLER_USERNAME}?openSaleOfferId=off-1`, { waitUntil: 'load' });
      await page.getByText('PÉPITES À DÉCOUVRIR').first().waitFor({ timeout: 40000 });
      await page.waitForTimeout(1500);
      const buy = page.getByText(/ACCEPTE LES CONDITIONS POUR CONTINUER|DÉBLOQUER LA COLLECTION|COMMENCER MA TRANSACTION|FREE INSUFFISANTS|PAIEMENT À ACTIVER/).last();
      const box = await buy.boundingBox();
      r.bouton_visible_sans_defiler = !!box && box.y >= 0 && box.y + box.height <= viewport.height;
      const btn = page.locator('[aria-label^="Débloquer la collection"], [aria-label^="Commencer ma transaction PayPal"], [aria-label^="FREE insuffisants"], [aria-label^="Tu as déjà tous"]').last();
      r.desactive_avant_case = (await btn.getAttribute('aria-disabled')) === 'true';
      const box0 = page.locator('[role="checkbox"]').first();
      r.liens_en_savoir_plus = await page.getByText('Plus', { exact: true }).count();
      if (mode !== 'FREE') {
        await box0.getByText('Plus', { exact: true }).click();
        await page.waitForTimeout(300);
        r.texte_complet_apres_clic = (await page.getByText(/je renonce à mon droit de rétractation/).count()) > 0;
        r.case_toujours_decochee = (await box0.getByText('✓').count()) === 0;
        await box0.getByText('Moins', { exact: true }).click();
        await page.waitForTimeout(200);
      }
      await shot('avant');
      await box0.click({ position: { x: 12, y: 14 } });
      await page.waitForTimeout(400);
      r.case_cochee = (await box0.getByText('✓').count()) > 0;
      r.actif_apres_case = (await btn.getAttribute('aria-disabled')) !== 'true';
      await page.getByRole('button', { name: /Afficher le détail/ }).click();
      await page.waitForTimeout(300);
      r.detail_deplie = (await page.getByText('DÉJÀ CHEZ TOI').count()) > 0;
      r.textes_sous_9px = await page.evaluate(() => {
        let card = [...document.querySelectorAll('div')].find((n) => n.textContent.trim() === 'PÉPITES À DÉCOUVRIR');
        while (card && !(card.getBoundingClientRect().width > 300 && card.getBoundingClientRect().width <= 430 && parseFloat(getComputedStyle(card).borderTopLeftRadius) >= 20)) card = card.parentElement;
        if (!card) return ['CARTE INTROUVABLE'];
        return [...card.querySelectorAll('div, span')].filter((n) => n.offsetParent && n.childElementCount === 0 && n.textContent.trim() && parseFloat(getComputedStyle(n).fontSize) < 9).map((n) => n.textContent.trim().slice(0, 30) + '@' + getComputedStyle(n).fontSize).slice(0, 6);
      });
      const box2 = await buy.boundingBox();
      r.bouton_visible_apres_depli = !!box2 && box2.y + box2.height <= viewport.height;
      await shot('apres');
      const checks = [
        ['bouton d’achat visible sans défiler', r.bouton_visible_sans_defiler],
        ['bouton désactivé tant que la case n’est pas cochée', r.desactive_avant_case],
        ['case cochée au clic', r.case_cochee],
        ['bouton actif après la case', r.actif_apres_case],
        ['détail dépliable (« DÉJÀ CHEZ TOI »)', r.detail_deplie],
        [`aucun texte < 9 px (${(r.textes_sous_9px || []).join(', ')})`, Array.isArray(r.textes_sous_9px) && r.textes_sous_9px.length === 0],
        ['bouton toujours visible après dépliage', r.bouton_visible_apres_depli],
      ];
      if (mode !== 'FREE') {
        checks.push(['lien « Plus » présent', r.liens_en_savoir_plus > 0]);
        checks.push(['texte de rétractation complet après « Plus »', r.texte_complet_apres_clic]);
        checks.push(['« Plus » ne coche pas la case', r.case_toujours_decochee]);
      }
      return { details: r, failures: failed(checks), ok: 'case obligatoire, détail, bouton visible' };
    },
  };
}

const boutiqueJourney = {
  id: 'boutique-pepites',
  titre: 'Boutique — bannière musicale, Pépite à la une, étagère, 40 offres',
  devices: [PC, ANDROID, PETIT],
  mobileFlags: false,
  fakeOptions: { mode: 'FREE', offers: 'forty' },
  async run({ page, shot }) {
    const r = {};
    const profileUrl = `${BASE}/profile/${fake.SELLER_USERNAME}`;
    await page.goto(profileUrl, { waitUntil: 'load' });
    await page.getByText(/^BOUTIQUE · @/).first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(2200);

    r.banniere = (await page.getByText(/^BOUTIQUE · @/).count()) > 0;
    r.titre_banniere = (await page.getByText('40 collections à découvrir').count()) > 0;
    r.pastilles = {
      free: (await page.getByText(/^✦ \d+ en FREE$/).count()) > 0,
      euro: (await page.getByText(/^€ \d+$/).count()) > 0,
      nouveautes: (await page.getByText(/nouveautés pour toi$/).count()) > 0,
      filtre_nouveautes: (await page.getByText('Nouveautés', { exact: true }).count()) > 0,
    };
    r.aucune_image_banniere = await page.evaluate(() => {
      const k = [...document.querySelectorAll('div')].find((n) => n.textContent.trim().startsWith('BOUTIQUE · @'));
      let b = k;
      for (let i = 0; i < 4 && b; i++) b = b.parentElement;
      return b ? b.querySelectorAll('img').length === 0 : null;
    });
    r.pepite_une = (await page.getByText('★ À LA UNE').count()) > 0;
    r.etagere_titre = (await page.getByText('Explorer').count()) > 0;
    r.tout_voir = (await page.getByText('Tout voir · 40 ›').count()) > 0;
    r.chips = {
      tout: (await page.getByText('Tout 40').count()) > 0,
      free: (await page.getByText(/^FREE 2\d$/).count()) > 0,
      euro: (await page.getByText(/^€ 1\d$/).count()) > 0,
    };
    r.cartes_etagere = await page.locator('[aria-label^="Écouter l\'aperçu de"]').count();
    await shot('profil');

    const allPreview = page.locator('[aria-label="Écouter tous les aperçus des pépites à la une"]').first();
    await allPreview.click({ force: true });
    await page.waitForTimeout(1200);
    r.cta_reagit = (await page.getByText(/Aperçu \d+\/\d+/i).count()) > 0
      || (await page.getByText(/Fin des aperçus/i).count()) > 0
      || (await page.getByText(/Extraits indisponibles|Chargement des aperçus/i).count()) > 0;
    await shot('apercus');
    await page.locator('[aria-label^="Fermer"]').first().click({ force: true }).catch(() => {});

    await page.goto(profileUrl, { waitUntil: 'load' });
    await page.getByText(/^BOUTIQUE · @/).first().waitFor({ timeout: 40000 });
    await page.getByText('Tout voir · 40 ›').first().click({ force: true });
    await page.waitForTimeout(1000);
    r.boutique_titre = (await page.getByText('PÉPITES LOKI').count()) > 0;
    r.boutique_compte = (await page.getByText(/^40 collections$/).count()) > 0;
    r.tri_prix = (await page.getByText('Prix croissant').count()) > 0;
    await page.getByText('€', { exact: true }).last().click({ force: true });
    await page.waitForTimeout(400);
    r.filtre_euro = await page.getByText(/^1\d collections$/).first().textContent({ timeout: 5000 }).catch(() => null);
    await page.getByText('Prix croissant').last().click({ force: true });
    await page.waitForTimeout(250);
    await page.locator('[aria-label^="Écouter l\'aperçu de"]').last().click({ force: true });
    await page.waitForTimeout(1200);
    r.ouvre_fenetre_ecoute = (await page.getByText('PÉPITES À DÉCOUVRIR').count()) > 0;
    await shot('fenetre');
    r.debordement_horizontal = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

    const checks = [
      ['bannière Boutique · @vendeur', r.banniere],
      ['sous-titre « 40 collections à découvrir »', r.titre_banniere],
      ['pastille FREE', r.pastilles.free],
      ['pastille €', r.pastilles.euro],
      ['filtre Nouveautés disponible même si aucune nouveauté n’est calculée', r.pastilles.filtre_nouveautes],
      ['aucune image dans la bannière', r.aucune_image_banniere === true],
      ['Pépite à la une visible', r.pepite_une],
      ['étagère « Explorer »', r.etagere_titre],
      ['lien « Tout voir · 40 »', r.tout_voir],
      ['filtre Tout 40', r.chips.tout],
      ['filtre FREE 2x', r.chips.free],
      ['filtre € 1x', r.chips.euro],
      ['cartes dans l’étagère', r.cartes_etagere > 0],
      ['CTA aperçus réagit', r.cta_reagit],
      ['boutique complète PÉPITES LOKI', r.boutique_titre && r.boutique_compte],
      ['tri Prix croissant disponible', r.tri_prix],
      ['filtre € dans la boutique', !!r.filtre_euro],
      ['une carte ouvre la fenêtre d’écoute', r.ouvre_fenetre_ecoute],
      ['aucun débordement horizontal', r.debordement_horizontal === false],
    ];
    return { details: r, failures: failed(checks), ok: `bannière actuelle, Pépite à la une, 40 offres, filtre € (${r.filtre_euro || '?'})` };
  },
};

const chatGroupJourney = {
  id: 'tchat-ecrire-groupe',
  titre: 'Tchat — écrire dans un groupe',
  devices: [ANDROID, MOBILE_SE, PC],
  mobileFlags: true,
  fakeOptions: { groupRole: 'MEMBER' },
  async run({ page, sb, shot }) {
    const r = {};
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await openGroup(page);
    r.message_bloque_dans_liste = (await page.getByText(/Écriture indisponible/).count()) > 0;
    await page.getByText(fake.GROUP_NAME).first().click();
    await page.waitForTimeout(1200);
    r.message_bloque_dans_groupe = (await page.getByText(/Écriture indisponible/).count()) > 0;
    r.invitation_a_accepter = (await page.getByText(/Accepte l’invitation/).count()) > 0;
    const input = page.locator('textarea, input[type="text"]').last();
    r.zone_ecriture_visible = (await input.count()) > 0 && (await input.isVisible());
    if (r.zone_ecriture_visible) {
      await input.click();
      await input.fill('Salut le groupe');
      await page.locator('[aria-label="Envoyer le message"]').last().click();
      await page.waitForTimeout(1200);
      r.message_envoye_au_serveur = sb.state.posted.length > 0 ? sb.state.posted[0].p_body : null;
      r.taille_police_saisie = await input.evaluate((n) => getComputedStyle(n).fontSize);
    }
    await shot('groupe');
    const checks = [
      ['pas de « Écriture indisponible » dans la liste', !r.message_bloque_dans_liste],
      ['pas de « Écriture indisponible » dans le groupe', !r.message_bloque_dans_groupe],
      ['pas d’invitation à accepter pour un membre actif', !r.invitation_a_accepter],
      ['zone d’écriture visible', r.zone_ecriture_visible],
      ['message « Salut le groupe » envoyé au serveur', r.message_envoye_au_serveur === 'Salut le groupe'],
    ];
    return { details: r, failures: failed(checks), ok: `message envoyé (police ${r.taille_police_saisie || '?'})` };
  },
};

const chatShareJourney = {
  id: 'tchat-vente-free-groupe',
  titre: 'Tchat — vendre un morceau en FREE dans un groupe (fenêtre verte)',
  devices: [ANDROID, MOBILE_SE, PC],
  mobileFlags: true,
  fakeOptions: { groupRole: 'MEMBER' },
  async run({ page, sb, shot }) {
    const r = {};
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await enterGroup(page);
    await page.locator('[aria-label="Ouvrir les actions du message"]').last().click({ force: true });
    await page.waitForTimeout(400);
    await page.locator('[aria-label="Ajouter une pépite"]').last().click({ force: true });
    await page.waitForTimeout(600);
    await page.getByText(fake.SHAREABLE_TRACK.title).last().click();
    await page.waitForTimeout(1200);
    await page.getByText('FREE', { exact: true }).last().click({ force: true });
    await page.waitForTimeout(600);
    Object.assign(r, await page.evaluate(() => {
      const eyebrow = [...document.querySelectorAll('div')].find((n) => n.textContent.trim() === 'MORCEAU SÉLECTIONNÉ');
      let box = eyebrow;
      while (box && !(getComputedStyle(box).borderTopWidth === '1px' && getComputedStyle(box).overflow === 'hidden' && box.getBoundingClientRect().height > 150)) box = box.parentElement;
      const rect = box ? box.getBoundingClientRect() : null;
      const inputs = [...document.querySelectorAll('input')].filter((i) => i.offsetParent);
      const price = inputs.find((i) => /^\d+$/.test(i.value) || i.inputMode === 'numeric' || i.inputMode === 'decimal');
      const pr = price ? price.getBoundingClientRect() : null;
      return { montant_dans_fenetre: !!(rect && pr && pr.top >= rect.top && pr.bottom <= rect.bottom) };
    }));
    await shot('fenetre');
    await page.getByText('PARTAGER LE MORCEAU').last().click({ force: true });
    await page.waitForTimeout(1500);
    const sent = sb.state.posted[0];
    r.offre_groupe_envoyee = sent ? { mode: sent.p_payment_mode, prix: sent.p_free_price } : null;
    r.confirmation = (await page.getByText(/Offre privée envoyée à 1 membre/).count()) > 0;
    r.fenetre_refermee = (await page.getByText('MORCEAU SÉLECTIONNÉ').count()) === 0;
    await shot('envoye');
    const checks = [
      ['champ montant à l’intérieur de la fenêtre', r.montant_dans_fenetre],
      ['offre envoyée en mode FREE', !!r.offre_groupe_envoyee && r.offre_groupe_envoyee.mode === 'FREE'],
      ['confirmation « Offre privée envoyée à 1 membre »', r.confirmation],
      ['fenêtre refermée après l’envoi', r.fenetre_refermee],
    ];
    return { details: r, failures: failed(checks), ok: `offre FREE envoyée (prix ${r.offre_groupe_envoyee ? r.offre_groupe_envoyee.prix : '?'})` };
  },
};

const chatActionsJourney = {
  id: 'tchat-repondre-reactions',
  titre: 'Tchat — répondre, réactions, ajouter un morceau',
  devices: [ANDROID, MOBILE_SE, PC],
  mobileFlags: true,
  fakeOptions: { groupRole: 'MEMBER', groupMessages: true },
  async run({ page, sb, shot }) {
    const r = {};
    const member = fake.MEMBER_USERNAME;
    const quote = new RegExp(`Réponse à @${member}`);
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await enterGroup(page);
    await page.getByText('Fais tourner le son').first().waitFor({ timeout: 15000 });
    await page.locator(`[aria-label="Répondre au message de ${member}"]`).first().click({ force: true });
    await page.waitForTimeout(700);
    r.citation_affichee = (await page.getByText(quote).count()) > 0;
    const input = page.locator('textarea, input[type="text"]').last();
    await input.click();
    await page.waitForTimeout(300);
    r.citation_apres_focus = (await page.getByText(quote).count()) > 0;
    await input.fill('Ok je réponds');
    await page.waitForTimeout(300);
    r.citation_apres_saisie = (await page.getByText(quote).count()) > 0;
    await shot('reponse');
    await page.locator('[aria-label="Envoyer le message"]').last().click({ force: true });
    await page.waitForTimeout(1200);
    const sent = sb.state.posted.find((p) => p.p_body === 'Ok je réponds');
    r.reponse_envoyee = sent ? { reply_to: sent.p_reply_to_message_id } : null;
    await page.locator('[aria-label="Ouvrir les actions du message"]').last().click({ force: true });
    await page.waitForTimeout(500);
    r.bouton_reactions = (await page.locator('[aria-label="Réactions"]').count()) > 0;
    r.bouton_morceau = (await page.locator('[aria-label="Ajouter une pépite"]').count()) > 0;
    await page.locator('[aria-label="Réactions"]').last().click({ force: true });
    await page.waitForTimeout(600);
    const emoji = page.getByText('🔥', { exact: true }).last();
    r.palette_visible = (await emoji.count()) > 0;
    if (r.palette_visible) { await emoji.click({ force: true }); await page.waitForTimeout(1000); }
    r.reaction_dans_message = await page.locator('textarea, input[type="text"]').last().inputValue().catch(() => '');
    await shot('reactions');
    await page.locator('[aria-label="Ajouter une pépite"]').last().click({ force: true });
    await page.waitForTimeout(800);
    r.liste_morceaux = (await page.getByText('Ajouter une pépite').count()) > 0;
    await shot('morceau');
    const checks = [
      ['citation « Réponse à @… » affichée', r.citation_affichee],
      ['citation conservée au focus', r.citation_apres_focus],
      ['citation conservée pendant la saisie', r.citation_apres_saisie],
      ['réponse envoyée avec le message cité', !!r.reponse_envoyee && r.reponse_envoyee.reply_to != null],
      ['bouton Réactions dans le menu +', r.bouton_reactions],
      ['bouton Ajouter une pépite dans le menu +', r.bouton_morceau],
      ['palette d’émojis visible', r.palette_visible],
      ['émoji 🔥 inséré dans la saisie', String(r.reaction_dans_message || '').includes('🔥')],
      ['liste des morceaux ouverte', r.liste_morceaux],
    ];
    return { details: r, failures: failed(checks), ok: `réponse au message ${r.reponse_envoyee ? r.reponse_envoyee.reply_to : '?'}, 🔥, liste des morceaux` };
  },
};

const groupAdminJourney = {
  id: 'groupe-createur-reglages',
  titre: 'Groupe (créateur) — supprimer le groupe + réglages des notifications',
  devices: [ANDROID, MOBILE_SE, PC],
  mobileFlags: true,
  fakeOptions: { groupRole: 'OWNER' },
  async run({ page, sb, viewport, shot }) {
    const r = {};
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await enterGroup(page);
    await page.locator('[aria-label="Gérer les membres du groupe"]').last().click({ force: true });
    await page.waitForTimeout(1000);
    const del = page.getByText('SUPPRIMER LE GROUPE').last();
    const box = await del.boundingBox();
    r.bouton_supprimer_visible = !!box && box.y + box.height <= viewport.height;
    r.bouton_retirer = (await page.getByText('RETIRER').count()) > 0;
    await shot('membres');
    await del.click({ force: true });
    await page.waitForTimeout(600);
    r.confirmation_affichee = (await page.getByText('Supprimer le groupe ?').count()) > 0;
    await page.getByText('Supprimer', { exact: true }).last().click({ force: true });
    await page.waitForTimeout(1200);
    r.suppression_envoyee = sb.state.posted.some((p) => p.deleted);
    await page.goto(`${BASE}/notifications`, { waitUntil: 'load' });
    await page.waitForTimeout(6000);
    const labels = ['Messages & social', 'Accès & paiements', 'Musique & Battle', 'Événements', 'Actualités & offres', 'Compte & sécurité'];
    r.reglages = {};
    // « · 🔒 » s'ajoute quand la formule ne permet pas de couper ce réglage.
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const l of labels) r.reglages[l] = (await page.getByText(new RegExp(`^${esc(l)}( · 🔒)?$`)).count()) > 0;
    r.anciens_supprimes = (await page.getByText('Battle', { exact: true }).count()) === 0;
    await page.getByText('Compte & sécurité', { exact: true }).last().scrollIntoViewIfNeeded().catch(() => {});
    await shot('notifications');
    const checks = [
      ['bouton « SUPPRIMER LE GROUPE » visible sans défiler', r.bouton_supprimer_visible],
      ['bouton RETIRER un membre', r.bouton_retirer],
      ['confirmation « Supprimer le groupe ? »', r.confirmation_affichee],
      ['suppression envoyée au serveur', r.suppression_envoyee],
      ...labels.map((l) => [`réglage « ${l} »`, r.reglages[l]]),
      ['ancien réglage isolé « Battle » retiré', r.anciens_supprimes],
    ];
    return { details: r, failures: failed(checks), ok: 'suppression confirmée, 6 réglages regroupés' };
  },
};

const chatRedirectJourney = {
  id: 'tchat-sans-redirection',
  titre: 'Tchat — pas de redirection involontaire',
  devices: [ANDROID, PC],
  mobileFlags: true,
  fakeOptions: { groupRole: 'MEMBER', groupMessages: true },
  async run({ page, shot }) {
    const r = {};
    const member = fake.MEMBER_USERNAME;
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await enterGroup(page);
    await page.getByText('Fais tourner le son').first().waitFor({ timeout: 15000 });
    const urlAvant = page.url();
    await page.getByText(`@${member}`).first().click({ force: true });
    await page.waitForTimeout(1500);
    r.reste_dans_le_groupe = page.url() === urlAvant && (await page.getByText('Fais tourner le son').count()) > 0;
    await page.locator(`[aria-label="Actions pour le message de ${member}"]`).first().click({ force: true });
    await page.waitForTimeout(600);
    r.menu_voir_profil = (await page.getByText('Voir le profil', { exact: true }).count()) > 0;
    r.menu_message_prive = (await page.getByText('Message privé', { exact: true }).count()) > 0;
    await shot('menu');
    const checks = [
      ['un appui sur @pseudo reste dans le groupe', r.reste_dans_le_groupe],
      ['menu « Voir le profil »', r.menu_voir_profil],
      ['menu « Message privé »', r.menu_message_prive],
    ];
    return { details: r, failures: failed(checks), ok: 'reste dans le groupe, menu Voir le profil / Message privé' };
  },
};

const LIVE_MAX_MS = 15000;
const LIVE_MAX_RELOADS = 10;
const chatLiveJourney = {
  id: 'tchat-message-en-direct',
  titre: 'Tchat — nouveau message visible sans rafraîchir',
  devices: [ANDROID],
  mobileFlags: true,
  fakeOptions: { groupRole: 'MEMBER', groupMessages: true },
  async run({ page, sb, shot }) {
    const r = {};
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await enterGroup(page);
    await page.getByText('Fais tourner le son').first().waitFor({ timeout: 15000 });
    const t0 = Date.now();
    sb.state.groupCalls.length = 0;
    sb.state.extraMessages.push({ id: 503, profile_id: fake.SELLER, username: fake.MEMBER_USERNAME, body: 'NOUVEAU MESSAGE EN DIRECT', created_at: new Date().toISOString() });
    let seenAt = null;
    for (let i = 0; i < LIVE_MAX_MS / 500 && !seenAt; i++) {
      await page.waitForTimeout(500);
      if ((await page.getByText('NOUVEAU MESSAGE EN DIRECT').count()) > 0) seenAt = Date.now() - t0;
    }
    r.nouveau_message_visible_apres_ms = seenAt;
    r.rechargements = sb.state.groupCalls.length;
    sb.state.extraMessages.length = 0;
    await shot('direct');
    const checks = [
      [`nouveau message affiché en moins de ${LIVE_MAX_MS / 1000} s sans rafraîchir`, seenAt != null],
      [`pas plus de ${LIVE_MAX_RELOADS} rechargements du fil pendant l’attente (${r.rechargements})`, r.rechargements <= LIVE_MAX_RELOADS],
    ];
    return { details: r, failures: failed(checks), ok: `message affiché après ${seenAt != null ? (seenAt / 1000).toFixed(1) : '?'} s, ${r.rechargements} rechargement(s)` };
  },
};

// Signal « nouveaux messages » (Adel 02/10/2026) : compteur juste (l'annonce
// « Tchat disponible » ne compte pas), contour lumineux sur le bouton et sur
// la conversation concernée, effacé dès qu'on l'ouvre.
const chatUnreadJourney = {
  id: 'tchat-signal-non-lus',
  titre: 'Tchat — signal des conversations non lues (compteur, contour, lecture)',
  devices: [ANDROID, MOBILE_SE, PC],
  mobileFlags: true,
  fakeOptions: { groupRole: 'MEMBER', groupMessages: true, unreadChat: true },
  async run({ page, sb, shot }) {
    const r = {};
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.getByText('Passer', { exact: true }).first().click({ timeout: 25000 }).catch(() => {});
    const open = page.locator('[aria-label="Ouvrir le Tchat"], [aria-label="Activer et ouvrir le Tchat"]').first();
    await open.waitFor({ timeout: 40000 });
    await page.waitForTimeout(1500);
    r.badge = (await page.locator('[data-testid="loki-global-chat-drawer"]').innerText().catch(() => '')).replace(/\s+/g, ' ');
    r.contour_bouton = await page.locator('[data-testid="loki-chat-unread-glow"]').count();
    await shot('bouton');
    await open.click({ force: true });
    // Le robot ouvre toujours la liste (Adel 02/10/2026).
    await page.waitForTimeout(1500);
    r.lues_a_l_ouverture = [...sb.state.readNotifications].sort();
    const back = page.locator('[aria-label="Retour aux conversations"]').first();
    if (await back.count()) await back.click({ force: true });
    await page.waitForTimeout(2500);
    r.retour_ok = (await page.locator('[aria-label="Retour aux conversations"]').count()) === 0;
    await page.getByText(fake.GROUP_NAME).first().waitFor({ timeout: 20000 });
    const groupUnreadRows = await page.locator('[data-testid="chat-row-unread"]').count();
    const directUnreadRow = page.getByLabel(`Ouvrir la conversation avec ${fake.SELLER_USERNAME}`).first();
    const directUnreadText = (await directUnreadRow.innerText().catch(() => '')).replace(/\s+/g, ' ');
    r.lignes_allumees = groupUnreadRows + (/\b1\b/.test(directUnreadText) ? 1 : 0);
    r.entete_a_lire = await page.getByText('conversations à lire').count();
    r.filtres_masques = (await page.getByText('Invitations', { exact: true }).count()) === 0;
    r.ligne_groupe_texte = (await page.locator('[data-testid="chat-row-unread"]').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    await shot('liste');
    await page.getByText(fake.GROUP_NAME).first().click();
    await page.waitForTimeout(1500);
    r.lues_apres_ouverture = [...sb.state.readNotifications].sort();
    const checks = [
      ['compteur du bouton = 2 conversations non lues (groupe + privé ; aucune alerte système)', /\b2\b/.test(r.badge) && !/\b3\b/.test(r.badge)],
      ['contour lumineux sur le bouton du tchat', r.contour_bouton === 1],
      ['le robot ouvre la LISTE : rien n’est marqué lu sans ouvrir une conversation', r.lues_a_l_ouverture.length === 0],
      ['la liste est affichée (pas de conversation ouverte)', r.retour_ok === true],
      ['2 conversations allumées (groupe + privé)', r.lignes_allumees === 2],
      ['mini-fenêtre : seulement les conversations à lire (en-tête, sans filtres)', r.entete_a_lire >= 1 && r.filtres_masques],
      ['ouvrir le groupe marque seulement ses 2 messages lus', r.lues_apres_ouverture.join(',') === 'n-g1,n-g2'],
    ];
    return { details: r, failures: failed(checks), ok: `compteur 2 conversations, contour allumé, liste avec 2 conversations allumées, groupe entièrement lu à l’ouverture` };
  },
};

// Mini-tchat (Adel 02/10/2026) : toucher le robot ouvre une mini-fenêtre, la
// page reste visible ; ⤢ passe en plein écran SANS perdre la conversation.
const chatMiniJourney = {
  id: 'tchat-mini-fenetre',
  titre: 'Tchat — mini-fenêtre sur la page, ⤢ plein écran sans perdre le fil',
  devices: [ANDROID, MOBILE_SE, PC],
  mobileFlags: true,
  fakeOptions: { groupRole: 'MEMBER', groupMessages: true },
  async run({ page, shot }) {
    const r = {};
    // Clavier simulé : un visualViewport contrôlable (hauteur réduite à la
    // demande), comme celui d'un téléphone quand le clavier s'ouvre.
    await page.addInitScript(() => {
      const fake = new EventTarget();
      window.__kbd = 0;
      for (const [k, fn] of Object.entries({ height: () => window.innerHeight - window.__kbd, width: () => window.innerWidth, offsetTop: () => window.__kbdTop || 0, offsetLeft: () => 0, scale: () => 1 })) {
        Object.defineProperty(fake, k, { get: fn });
      }
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake });
    });
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await openGroup(page);
    const mini = page.locator('[data-testid="loki-chat-mini"]');
    r.mini = await mini.count();
    const box = r.mini ? await mini.first().boundingBox() : null;
    const vp = page.viewportSize();
    r.hauteur_mini_pct = box ? Math.round((box.height / vp.height) * 100) : null;
    r.dans_ecran = Boolean(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1);
    r.page_visible = (await page.getByRole('button', { name: /Trouver le morceau/i }).first().isVisible().catch(() => false));
    await page.getByText(fake.GROUP_NAME).first().click();
    await page.getByText('Fais tourner le son').first().waitFor({ timeout: 15000 });
    r.composer_visible = await page.getByPlaceholder('Écris un message…').first().isVisible().catch(() => false);
    await shot('mini');
    if (vp.width < 900) {
      await page.evaluate(() => { window.__kbd = 300; window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(600);
      const kb = await mini.first().boundingBox();
      const composer = await page.getByPlaceholder('Écris un message…').first().boundingBox();
      r.clavier_mini = kb ? { top: Math.round(kb.y), bas: Math.round(kb.y + kb.height), hauteur: Math.round(kb.height) } : null;
      r.clavier_ok = Boolean(kb && composer && kb.y >= 0 && kb.y + kb.height <= vp.height - 300 + 1 && kb.height <= 381 && composer.y + composer.height <= vp.height - 300 + 1 && composer.y >= kb.y);
      await shot('clavier');
      // iPhone Safari : en plus de réduire la zone visible, Safari FAIT
      // DÉFILER la page (offsetTop > 0). La zone vue par l'utilisateur va
      // alors de offsetTop à offsetTop + hauteur visible : le champ doit y
      // être (bug du 02/10/2026 : seule la barre d'onglets restait visible).
      await page.evaluate(() => { window.__kbdTop = 200; window.visualViewport.dispatchEvent(new Event('scroll')); window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(700);
      const ios = await mini.first().boundingBox();
      const iosComposer = await page.getByPlaceholder('Écris un message…').first().boundingBox();
      const visTop = 200; const visBottom = 200 + vp.height - 300;
      r.clavier_iphone = ios ? { top: Math.round(ios.y), bas: Math.round(ios.y + ios.height), zone: [visTop, visBottom] } : null;
      r.clavier_iphone_ok = Boolean(ios && iosComposer && ios.y >= visTop - 1 && ios.y + ios.height <= visBottom + 1 && iosComposer.y >= visTop && iosComposer.y + iosComposer.height <= visBottom + 1);
      await shot('clavier-iphone');
      await page.evaluate(() => { window.__kbd = 0; window.__kbdTop = 0; window.visualViewport.dispatchEvent(new Event('scroll')); window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(400);
    } else {
      r.clavier_ok = true;
      r.clavier_iphone_ok = true;
    }
    await page.locator('[aria-label="Agrandir le tchat en plein écran"]').first().click({ force: true });
    await page.waitForTimeout(1500);
    r.plein_ecran = await page.locator('[data-testid="loki-chat-fullscreen-modal"]').count();
    r.meme_fil = (await page.getByText('Fais tourner le son').count()) > 0;
    await shot('plein-ecran');
    const checks = [
      ['le robot ouvre la mini-fenêtre (pas le plein écran)', r.mini === 1],
      ['la mini-fenêtre reste entièrement dans l’écran', r.dans_ecran],
      ['la page reste visible derrière', r.page_visible],
      ['on peut écrire dans la mini-fenêtre', r.composer_visible],
      ['clavier ouvert : mini-fenêtre compacte juste au-dessus du clavier, champ visible', r.clavier_ok],
      ['iPhone Safari (page défilée par le clavier) : mini-fenêtre et champ dans la zone visible', r.clavier_iphone_ok],
      ['⤢ passe en plein écran', r.plein_ecran === 1],
      ['le plein écran garde la même conversation', r.meme_fil],
    ];
    return { details: r, failures: failed(checks), ok: `mini ${r.hauteur_mini_pct} % de l’écran, page visible, plein écran sur le même fil` };
  },
};

// Les notifications de nouveaux titres sont désormais routées vers Stories.
// Le test vérifie qu'une ancienne ligne NEW_PUBLIC_KEEP ne réapparaisse pas
// dans la cloche ni dans le compteur (sans exposer titre, artiste, pochette).
const newKeepNotifJourney = {
  id: 'notif-nouveau-morceau-masque',
  titre: 'Nouveau morceau vers Stories — pas de doublon dans la cloche',
  devices: [ANDROID, MOBILE_SE, PC],
  mobileFlags: true,
  fakeOptions: { newKeepNotif: true },
  async run({ page, shot }) {
    const r = {};
    await page.goto(`${BASE}/notifications`, { waitUntil: 'load' });
    await page.getByText('Centre de notifications').first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(900);
    const content = await page.locator('body').innerText();
    r.titre_masque = !content.includes(fake.SECRET_TRACK.title) && !content.includes(fake.SECRET_TRACK.artist);
    r.pochette_masquee = (await page.locator('img[src*="secret.jpg"]').count()) === 0;
    r.hors_cloche = content.includes('Aucune notification pour le moment.');
    r.compteur_zero = (await page.getByText('0 non lue').count()) > 0;
    r.pas_ancien_bouton = (await page.locator('[data-testid="new-keep-keep"]').count()) === 0;
    await shot('stories-sans-doublon');
    const checks = [
      ['titre et artiste masqués', r.titre_masque],
      ['pochette masquée', r.pochette_masquee],
      ['nouveau morceau absent de la cloche', r.hors_cloche],
      ['compteur de notifications non pollué', r.compteur_zero],
      ['ancien bouton GARDER absent de la cloche', r.pas_ancien_bouton],
    ];
    return { details: r, failures: failed(checks), ok: 'nouveaux titres dirigés vers Stories, cloche désencombrée' };
  },
};

// Battle en ligne (Adel 02/10/2026, capture iPhone) : grand vide sous les
// réponses → visuel agrandi (carré au maximum), réponses descendues ; et
// « personne n'a trouvé » affiché quand aucun joueur n'a la bonne réponse.
const battleArenaLayoutJourney = {
  id: 'battle-en-ligne-ecran-de-jeu',
  titre: 'Battle en ligne — visuel agrandi, réponses en bas, « personne n’a trouvé »',
  devices: [ANDROID, MOBILE_SE, PC],
  mobileFlags: true,
  fakeOptions: { battleArena: true },
  async run({ page, sb, shot }) {
    const r = {};
    await page.goto(`${BASE}/Main/Parties?openBattle=1&arenaId=arena-1`, { waitUntil: 'load' });
    await page.getByText('QUI CHANTE ?').first().waitFor({ timeout: 40000 });
    await page.waitForTimeout(1200);
    const vp = page.viewportSize();
    const answers = page.getByText("The O'Jays", { exact: true }).first();
    const boxAns = await answers.boundingBox();
    const earth = await page.getByText('Earth', { exact: true }).first().boundingBox();
    const visualBox = await page.getByTestId('battle-round-visual').first().boundingBox();
    const visual = visualBox ? Math.round(visualBox.height) : 0;
    r.hauteur_visuel = visual;
    r.reponses_bas = boxAns ? Math.round(boxAns.y + boxAns.height) : null;
    r.reponses_dans_ecran = Boolean(boxAns && earth && earth.y > 0 && boxAns.y + boxAns.height <= vp.height);
    await shot('manche');
    sb.state.arenaRevealed = true;
    await page.getByTestId('battle-round-no-winner').first().waitFor({ timeout: 20000 }).catch(() => {});
    r.personne = await page.getByTestId('battle-round-no-winner').count();
    r.texte_personne = (await page.getByTestId('battle-round-no-winner').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
    await shot('personne');
    const mobile = vp.width < 900;
    const checks = [
      ['visuel Battle visible (jamais sous 118 px)', r.hauteur_visuel >= 118],
      ['ordinateur : visuel plafonné à 420 px', mobile || r.hauteur_visuel <= 421],
      ['téléphone : réponses descendues en bas (moins de 140 px au-dessus des onglets)', !mobile || (r.reponses_bas != null && vp.height - r.reponses_bas < 140)],
      ['les 4 réponses restent entièrement visibles', r.reponses_dans_ecran],
      ['« personne n’a trouvé » affiché quand aucun gagnant', r.personne === 1 && /PERSONNE/.test(r.texte_personne)],
    ];
    return { details: r, failures: failed(checks), ok: `visuel ${r.hauteur_visuel} px, réponses visibles, « personne n’a trouvé »` };
  },
};

// Solos épuisés (Adel 02/10/2026) : sous « Recharger mes Solos », le pack et
// son prix réglés dans le Super Admin + « En savoir plus » clair.
const soloRechargeJourney = {
  id: 'battle-recharger-solos',
  titre: 'Battle — Solos épuisés : packs dynamiques du Super Admin + Plus',
  devices: [ANDROID, MOBILE_SE, PC],
  mobileFlags: true,
  fakeOptions: { soloExhausted: true },
  async run({ page, shot }) {
    const r = {};
    await page.goto(`${BASE}/Main/Parties?openBattle=1`, { waitUntil: 'load' });
    await page.getByText('＋ ACHETER DES SOLOS').first().waitFor({ timeout: 40000 });
    await page.getByText(/\+12 Solos pour 4 Free/).first().waitFor({ timeout: 15000 }).catch(() => {});
    const body = await page.locator('body').innerText();
    r.prix_sous_bouton = body.includes('+12 Solos pour 4 Free') && body.includes('+30 Solos pour 7 Free');
    r.ancienne_phrase = body.includes('attends la recharge');
    await page.getByRole('button', { name: /Deux packs au choix\. Plus/ }).first().click();
    await page.waitForTimeout(400);
    r.explication = (await page.getByText(/Packs disponibles : \+12 Solos pour 4 Free · \+30 Solos pour 7 Free/).count()) > 0;
    await shot('recharger');
    // Popup « Solos terminés » (3 boutons) : règle des popups (Adel
    // 02/10/2026) — tous les boutons sur UNE ligne en bas, même largeur.
    await page.getByText('SOLO', { exact: true }).first().click({ force: true });
    await page.getByText('Tes parties Solo du jour sont terminées').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(400);
    r.boutons_popup = await page.evaluate(() => {
      const row = document.querySelector('[data-testid="keep-alert-buttons"]');
      if (!row) return null;
      return [...row.children].map((b) => { const x = b.getBoundingClientRect(); return { top: Math.round(x.top), w: Math.round(x.width), right: Math.round(x.right), left: Math.round(x.left) }; });
    });
    const rowBox = await page.locator('[data-testid="keep-alert-buttons"]').first().boundingBox();
    const bp = r.boutons_popup || [];
    r.popup_alignee = bp.length === 3
      && Math.max(...bp.map((b) => b.top)) - Math.min(...bp.map((b) => b.top)) <= 1
      && Math.max(...bp.map((b) => b.w)) - Math.min(...bp.map((b) => b.w)) <= 2
      && rowBox && Math.abs(bp[0].left - rowBox.x) <= 1 && Math.abs(bp[2].right - (rowBox.x + rowBox.width)) <= 1;
    await shot('popup-solos-termines');
    const checks = [
      ['popup à 3 boutons : une seule ligne en bas, même largeur, toute la largeur', r.popup_alignee],
      ['sous le bouton : packs et prix du Super Admin (+12/4 et +30/7)', r.prix_sous_bouton],
      ['plus de « ou attends la recharge de 2 h »', !r.ancienne_phrase],
      ['« Plus » reprend exactement les packs dynamiques', r.explication],
    ];
    return { details: r, failures: failed(checks), ok: 'prix affiché, explication claire' };
  },
};

// Deux navigateurs authentifiés sur le même compte synthétique : le téléphone
// marque la notification lue ; le PC doit effacer badge et rappel même si
// le canal Realtime est coupé (le faux backend bloque /realtime/).
const crossDeviceReadJourney = {
  id: 'tchat-lecture-telephone-vers-ordinateur',
  titre: 'Tchat — lu sur téléphone = plus de non-lu sur PC sans actualiser',
  devices: [PC],
  mobileFlags: false,
  fakeOptions: { unreadChat: true, groupMessages: true },
  async run({ page, sb, shot }) {
    const r = {};
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.getByText('Passer', { exact: true }).first().click({ timeout: 25000 }).catch(() => {});
    const unreadGlow = page.locator('[data-testid="loki-chat-unread-glow"]');
    await unreadGlow.waitFor({ state: 'visible', timeout: 25000 });
    r.pc_non_lu_avant = await unreadGlow.count();
    await shot('pc-avant-lecture');

    const browser = page.context().browser();
    if (!browser) throw new Error('Navigateur Playwright absent');
    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await mobileContext.addInitScript(([k, v]) => {
        try { localStorage.setItem(k, v); localStorage.setItem('keep_has_seen_onboarding_guide', 'true'); } catch {}
      }, [fake.AUTH_STORAGE_KEY, JSON.stringify(sb.session)]);
      const mobile = await mobileContext.newPage();
      await mobile.route((url) => !url.href.startsWith(ORIGIN), (route) => {
        const url = route.request().url();
        if (/supabase\.co/.test(new URL(url).hostname)) return sb.respond(route);
        if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
        return route.abort();
      });
      await mobile.goto(`${BASE}/notifications`, { waitUntil: 'load' });
      await mobile.getByText('Centre de notifications').first().waitFor({ timeout: 25000 });
      const deadline = Date.now() + 16000;
      while (!sb.state.readNotifications.includes('n-d1') && Date.now() < deadline) {
        await mobile.waitForTimeout(250);
      }
      r.lu_sur_telephone = ['n-g1', 'n-g2', 'n-d1'].every((id) => sb.state.readNotifications.includes(id));
      await mobile.screenshot({ path: require('path').join(process.env.JOURNEYS_OUT || 'artifacts/journeys', 'captures', 'crossdevice-mobile-lu.png') }).catch(() => {});
      const start = Date.now();
      let cleared = false;
      while (Date.now() - start < 38000) {
        if (await unreadGlow.count() === 0) { cleared = true; break; }
        await page.waitForTimeout(400);
      }
      r.pc_non_lu_apres = await unreadGlow.count();
      r.temps_sync_ms = Date.now() - start;
      await shot('pc-apres-lecture');
      const checks = [
        ['badge non lu affiché au départ sur PC', r.pc_non_lu_avant === 1],
        ['téléphone authentifié : les messages sont lus en base', r.lu_sur_telephone],
        ['badge PC supprimé sans recharger, malgré Realtime indisponible', cleared && r.pc_non_lu_apres === 0],
      ];
      return { details: r, failures: failed(checks), ok: `badge effacé sur PC en ${Math.ceil(r.temps_sync_ms / 1000)} s après lecture mobile` };
    } finally {
      await mobileContext.close();
    }
  },
};

// Contrôle visuel du badge PC réel (après QR) : horloge locale, session
// serveur non révoquée et aucune fenêtre HTML distincte de l'accueil Loki.
const pcConnectionCountdownJourney = {
  id: 'pc-connexion-compteur-24h',
  titre: 'PC connecté — compte à rebours 24 h dans l’accueil',
  devices: [PC],
  mobileFlags: false,
  fakeOptions: { pcSession: true },
  async run({ page, shot }) {
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await page.getByText('Passer', { exact: true }).first().click({ timeout: 15000 }).catch(() => {});
    await page.getByText('PC CONNECTÉ', { exact: true }).waitFor({ timeout: 25000 });
    const badge = page.locator('[data-testid="pc-connected-countdown"]');
    const shown = (await badge.innerText()).replace(/\s+/g, ' ');
    const looksLikeCountdown = /2[12]:\d{2}:\d{2}/.test(shown);
    const initial = shown.match(/(\d{2}:\d{2}:\d{2})/)?.[1];
    await page.waitForTimeout(1250);
    const later = (await badge.innerText()).match(/(\d{2}:\d{2}:\d{2})/)?.[1];
    let sidebarBox = await page.locator('[data-testid="desktop-sidebar"]').boundingBox();
    for (let retry = 0; retry < 20 && sidebarBox && sidebarBox.x < -2; retry++) {
      await page.waitForTimeout(150);
      sidebarBox = await page.locator('[data-testid="desktop-sidebar"]').boundingBox();
    }
    const chatDrawerBox = await page.locator('[data-testid="loki-global-chat-drawer"]').boundingBox();
    const pageGeometry = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    await shot('accueil-pc-connexion-24h');
    const checks = [
      ['navigation bureau entière visible sans rognage latéral', !!sidebarBox && sidebarBox.x >= -2 && sidebarBox.width >= 220],
      ['tiroir Tchat entièrement visible sur PC', !!chatDrawerBox && chatDrawerBox.x >= 0 && chatDrawerBox.x + chatDrawerBox.width <= pageGeometry.width],
      ['aucun débordement horizontal du document', pageGeometry.scrollWidth <= pageGeometry.width + 3],
      ['PC connecté est visible sur accueil, sans page supplémentaire', await badge.isVisible()],
      ['durée initiale cohérente avec la session serveur de 75 minutes', looksLikeCountdown],
      ['compteur avance sans requête réseau chaque seconde', !!initial && !!later && initial !== later],
    ];
    return { details: { initial, later, shown, sidebarBox, pageGeometry }, failures: failed(checks), ok: 'Compteur PC 24 h affiché et animé sur accueil' };
  },
};

// Régression visuelle signalée depuis un PC HP, navigateur peu haut :
 // l'accueil coupait la reconnaissance et le lecteur Story était décalé vers le bas.
const desktopHomeStoryJourney = {
  id: 'design-accueil-story-centres',
  titre: 'Accueil et Story centrés, boutons visibles sans défilement',
  devices: [
    ['PC compact 1098x620', { width: 1098, height: 620 }],
    ['PC 1366x650', { width: 1366, height: 650 }],
    ['Mobile 390x844', { width: 390, height: 844 }],
  ],
  mobileFlags: true,
  fakeOptions: { pcSession: true, ownStory: true },
  async run({ page, viewport, shot }) {
    const checks = [];
    const desktop = viewport.width >= 1024;
    const inViewport = (rect) => Boolean(rect && rect.y >= -3 && rect.y + rect.height <= viewport.height + 3);
    await page.goto(`${BASE}/Main/Listen/`, { waitUntil: 'load' });
    await page.getByText('Passer', { exact: true }).first().click({ timeout: 12000 }).catch(() => {});
    const homeHero = page.locator('[data-testid="home-idle-hero"]');
    await homeHero.waitFor({ state: 'visible', timeout: 35000 });
    const action = page.getByRole('button', { name: /Trouver le morceau qui joue/i }).first();
    await action.waitFor({ state: 'visible', timeout: 20000 });
    const homeRect = await homeHero.boundingBox();
    const buttonRect = await action.boundingBox();
    checks.push(['bouton Trouver le morceau entièrement visible', inViewport(buttonRect)]);
    checks.push(['accueil entièrement visible', inViewport(homeRect)]);
    checks.push(['menu sessions non redondant PC / conservé mobile',
      (await page.locator('[data-testid="home-sessions-menu"]').count()) === (desktop ? 0 : 1)]);
    if (desktop) {
      checks.push(['deux colonnes desktop réellement disposées côte à côte', !!homeRect && homeRect.width >= 560]);
      checks.push(['compteur de connexion PC toujours visible', await page.locator('[data-testid="pc-connected-countdown"]').isVisible()]);
      const chatLauncher = await page.locator('[data-testid="loki-global-chat-drawer"]').boundingBox();
      checks.push(['bouton Tchat complètement visible sur bureau, même à 1098 px', !!chatLauncher && chatLauncher.x >= -2 && chatLauncher.x + chatLauncher.width <= viewport.width + 2]);
      checks.push(['robot Tchat ne masque pas le texte du panneau principal', !!chatLauncher && !!homeRect && homeRect.x + homeRect.width <= chatLauncher.x + 2]);
    }
    await shot('accueil-cadre');
    await page.goto(`${BASE}/Main/Profile/`, { waitUntil: 'load' });
    const ownStory = page.locator('[data-testid="home-story-own"]');
    await ownStory.waitFor({ state: 'visible', timeout: 35000 });
    await page.getByRole('button', { name: 'Ouvrir ta story' }).first().waitFor({ state: 'visible', timeout: 35000 });
    await ownStory.click();
    const player = page.locator('[data-testid="story-player"]');
    await player.waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(500);
    const storyRect = await player.boundingBox();
    const header = page.getByText('Ta story', { exact: true }).last();
    const headerRect = await header.boundingBox();
    const viewerChip = await page.locator('[data-testid="story-views-chip"]').boundingBox();
    checks.push(['compteur des spectateurs non coupé dans la Story', inViewport(viewerChip) && !!viewerChip && viewerChip.height >= 34]);
    checks.push(['lecteur Story entièrement contenu dans le viewport', inViewport(storyRect)]);
    checks.push(['titre Story accessible en haut', !!headerRect && headerRect.y >= 0 && headerRect.y <= viewport.height * 0.35]);
    if (desktop) {
      // Design bureau « Swipe immersif » (#181) : lecteur Story (≤ 560 px) + panneau d'aide à droite,
      // l'ENSEMBLE doit être centré dans la fenêtre et rester entièrement visible.
      const aside = await page.locator('[data-testid="loki-desktop-story-aside"]').boundingBox();
      const left = storyRect ? storyRect.x : 0;
      const right = aside ? aside.x + aside.width : (storyRect ? storyRect.x + storyRect.width : 0);
      checks.push(['lecteur Story ≤ 560 px de large (fenêtre de téléphone)', !!storyRect && storyRect.width <= 562]);
      checks.push(['panneau d’aide Story présent à droite du lecteur', !!aside && !!storyRect && aside.x >= storyRect.x + storyRect.width - 2]);
      checks.push(['Story + panneau centrés horizontalement et entièrement dans la fenêtre',
        !!storyRect && left >= -2 && right <= viewport.width + 2 && Math.abs((left + right) / 2 - viewport.width / 2) < 15]);
    }
    await shot('story-cadree');
    return {
      details: { homeRect, buttonRect, storyRect, headerRect, viewerChip },
      failures: failed(checks),
      ok: 'Accueil et Story dans la fenêtre, sans bouton coupé ni double hamburger PC',
    };
  },
};

const listenPcAndEventStoryJourney = {
  id: 'mobile-pc-quotas-event-story',
  titre: 'Transfert PC, accueil sans RESTANTES, Story de soirée avec réponse et points Pulse',
  devices: [
    ['PC compact 1098x620', { width: 1098, height: 620 }],
    ['iPhone simulé 390x844', { width: 390, height: 844 }],
  ],
  mobileFlags: true,
  fakeOptions: { pcSession: true, eventStories: true, ownStory: true },
  async run({ page, viewport, shot }) {
    const desktop = viewport.width >= 1024;
    const checks = [];
    await page.goto(`${BASE}/Main/Listen/`, { waitUntil: 'load' });
    await page.getByText('Passer', { exact: true }).first().click({timeout:12000}).catch(() => {});
    await page.getByRole('button', { name: /Trouver le morceau qui joue/i }).first().waitFor({ state:'visible', timeout:30000 });
    if (desktop) {
      const sidebar = page.locator('[data-testid="desktop-sidebar"]');
      checks.push(['panneau identifiant utilisateur PC visible', await sidebar.isVisible()]);
      checks.push(['Loki Music et @testeur dans la barre de gauche',
        (await sidebar.innerText()).includes('Loki Music') && (await sidebar.innerText()).includes('@testeur')]);
    } else {
      const transfer = page.locator('[data-testid="home-transfer-to-pc"]');
      checks.push(['transfert PC visible depuis accueil iPhone', await transfer.isVisible()]);
      checks.push(['ancien compteur RESTANTES absent de l’accueil', !(await page.locator('body').innerText()).includes('RESTANTES')]);
      const shareErrors = [];
      page.on('pageerror', (error) => { shareErrors.push(String(error.message)); });
      page.on('dialog', (dialog) => { void dialog.dismiss(); });
      await transfer.click();
      await page.waitForTimeout(450);
      checks.push(['transfert PC actionnable sans erreur JavaScript', shareErrors.length === 0]);
    }
    await shot('accueil-quotas-et-pc');
    await page.goto(`${BASE}/Main/Profile/`, { waitUntil:'load' });
    const eventBubble = page.locator('[data-testid="story-event-0b5e7a1c-0000-4000-8000-00000000d101"]');
    await eventBubble.waitFor({ state:'visible', timeout:30000 });
    await eventBubble.click();
    await page.locator('[data-testid="event-story-modal"]').waitFor({ state:'visible', timeout:20000 });
    const body = await page.locator('[data-testid="event-story-modal"]').innerText();
    checks.push(['Story soirée nom et points Pulse visibles', body.includes('Soirée rooftop synthétique') && body.includes('67 points')]);
    const maybe = page.getByRole('button', { name:'Peut-être' }).last();
    checks.push(['bouton Peut-être disponible', await maybe.isVisible()]);
    await maybe.click();
    await page.waitForTimeout(350);
    const changed = await page.locator('[data-testid="event-story-modal"]').innerText();
    checks.push(['RSVP enregistré et confirmé', changed.includes('✓ Peut-être')]);
    await shot('story-evenement-rsvp-pulse');
    return { details:{ desktop, text:body.slice(0,220) }, failures:failed(checks), ok:'Transfert PC et Story événement interactive contrôlés' };
  },
};

// Reproduction utilisateur PC HP : Soirées et Battle doivent remplir la largeur
// restante, la colonne identité/micro/session tient sans scroll même à 560px.
const desktopPartiesBattleSidebarJourney = {
  id: 'desktop-soirees-battle-sidebar-sans-scroll',
  titre: 'PC : Soirées et Battle sur toute la largeur, micro visible sans défiler',
  devices: [
    ['PC compact 1024x560', { width: 1024, height: 560 }],
    ['PC HP 1098x620', { width: 1098, height: 620 }],
    ['PC standard 1440x900', { width: 1440, height: 900 }],
    ['PC large 1920x1080', { width: 1920, height: 1080 }],
  ],
  mobileFlags: false,
  fakeOptions: { pcSession: true },
  async run({ page, viewport, shot }) {
    const checks = [];
    // Règle produit (PartiesScreen.desktopBattleWide) : panneaux latéraux seulement à partir de 1800 px de large.
    const wide = viewport.width >= 1800 && viewport.height >= 550;
    const fit = (rect) => Boolean(rect && rect.y >= -2 && rect.y + rect.height <= viewport.height + 2 && rect.x >= -2 && rect.x + rect.width <= viewport.width + 2);
    await page.goto(`${BASE}/Main/Parties/`, { waitUntil: 'load' });
    const sidebar = page.getByTestId('desktop-sidebar');
    await sidebar.waitFor({ state: 'visible', timeout: 35000 });
    const username = await sidebar.innerText();
    checks.push(['logo Loki Music et @testeur visibles dans la colonne', username.includes('Loki Music') && username.includes('@testeur')]);
    const micro = page.getByTestId('desktop-mic-status');
    const microRect = await micro.boundingBox();
    checks.push(['pastille MICRO À L’ARRÊT accessible immédiatement en haut', fit(microRect) && microRect.y < 220]);
    checks.push(['état micro lisible et non tronqué', (await micro.innerText()).includes('MICRO À L’ARRÊT')]);
    const sessions = page.getByTestId('desktop-open-sessions');
    const sessionRect = await sessions.boundingBox();
    checks.push(['MES SESSIONS accessible sans scroll latéral', fit(sessionRect)]);
    const navFit = await sidebar.evaluate((el) => el.scrollHeight <= el.clientHeight + 3);
    checks.push(['barre latérale sans défilement vertical', navFit]);
    const home = page.getByTestId('parties-home-actions');
    await home.waitFor({ state: 'visible', timeout: 30000 });
    const homeRect = await home.boundingBox();
    checks.push(['cartes de soirée dans la largeur PC', !!homeRect && homeRect.width >= viewport.width * 0.57]);
    const actions = page.getByRole('button', { name: /Créer une soirée|Voir mes soirées|Voir mes invitations/i });
    checks.push(['les trois actions Soirées sont présentes', (await actions.count()) >= 3]);
    const dockRect = await page.getByTestId('loki-global-chat-drawer').boundingBox();
    const actionRects = await Promise.all((await actions.all()).map((action) => action.boundingBox()));
    const dockOverlapsActions = !!dockRect && actionRects.some((card) => !!card
      && dockRect.x < card.x + card.width && dockRect.x + dockRect.width > card.x
      && dockRect.y < card.y + card.height && dockRect.y + dockRect.height > card.y);
    checks.push(['le Tchat ne recouvre aucune des trois cartes Soirées', !dockOverlapsActions]);
    await shot('soirees-pleine-largeur');
    await page.getByRole('button', { name: 'Ouvrir directement Battle' }).click();
    const stage = page.getByTestId('desktop-battle-stage');
    await stage.waitFor({ state: 'visible', timeout: 30000 });
    const stageRect = await stage.boundingBox();
    const sidebarRect = await sidebar.boundingBox();
    checks.push(['Battle occupe toute la largeur hors barre latérale', !!stageRect && !!sidebarRect && stageRect.width >= viewport.width - sidebarRect.width - 18]);
    checks.push(['fond Battle violet présent sur la totalité du bureau', await page.getByTestId('desktop-battle-atmosphere').isVisible()]);
    const leftPanel = page.getByTestId('desktop-battle-left');
    const rightPanel = page.getByTestId('desktop-battle-right');
    let left = null; let right = null;
    if (wide) {
      checks.push(['panneau informations gauche présent sans chevauchement', await leftPanel.isVisible()]);
      checks.push(['panneau informations droit présent sans chevauchement', await rightPanel.isVisible()]);
      left = await leftPanel.boundingBox();
      right = await rightPanel.boundingBox();
      checks.push(['panneaux desktop entièrement dans leur zone', !!left && !!right && !!stageRect && left.x >= stageRect.x && right.x + right.width <= stageRect.x + stageRect.width + 2 && left.x + left.width < right.x]);
    } else {
      // Fenêtre < 1800 px : aucun panneau latéral (il écraserait le cockpit) — la zone centrale garde toute la largeur.
      checks.push(['sous 1800 px : aucun panneau latéral qui rogne le cockpit Battle', (await leftPanel.count()) === 0 && (await rightPanel.count()) === 0]);
    }
    await shot('battle-pleine-largeur');
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    checks.push(['aucun débordement horizontal page', docWidth <= viewport.width + 4]);
    const sidebarMicroBattle = await page.getByTestId('desktop-mic-status').boundingBox();
    checks.push(['état micro reste affiché pendant Battle', fit(sidebarMicroBattle)]);
    return { details: { homeRect, microRect, sessionRect, stageRect, left, right, docWidth }, failures: failed(checks), ok: 'Soirées, Battle et sidebar visibles dans la fenêtre PC, sans bande noire vide ni défilement latéral' };
  },
};


// Swipe sur les titres importés via YouTube (incident 14/10/2026) : l'iframe du fournisseur avalait tous les gestes
// (aperçu du profil) et les Stories défilaient seules en 2,4 s sans jamais proposer la vidéo.
async function dragGesture(page, viewport, x, y, dx, dy) {
  if (viewport.width < 500) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i += 1) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) await page.mouse.move(x + (dx * i) / 10, y + (dy * i) / 10);
    await page.mouse.up();
  }
  await page.waitForTimeout(900);
}
const swipeYoutubeJourney = {
  id: 'swipe-stories-youtube',
  titre: 'Swipe des Stories et de l’aperçu du profil, titres importés via YouTube',
  devices: [PC, ANDROID],
  mobileFlags: true,
  fakeOptions: { pcSession: true, ownStory: 'multi', ownKeeps: true },
  async run({ page, viewport, shot }) {
    const checks = [];
    const meta = page.locator('[data-testid="swipe-metadata-below-artwork"]');
    const title = async () => (await meta.innerText().catch(() => '')).replace(/\s+/g, ' ');
    // --- Story : on passe d'une musique à l'autre au geste, sans défilement automatique des titres YouTube.
    await page.goto(`${BASE}/Main/Profile/`, { waitUntil: 'load' });
    await page.locator('[data-testid="home-story-own"]').waitFor({ state: 'visible', timeout: 35000 });
    await page.locator('[data-testid="home-story-own"]').click();
    await page.locator('[data-testid="story-player"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(700);
    const card = await page.locator('[data-testid="swipe-neon-depth-card"]').boundingBox();
    const cx = card.x + card.width / 2;
    const cy = card.y + card.height / 2;
    checks.push(['Story : départ sur la première musique', (await title()).includes('Ma musique de démonstration')]);
    await dragGesture(page, viewport, cx, cy, -200, 0);
    checks.push(['Story : glisser à gauche passe à la musique suivante', (await title()).includes('démonstration 2')]);
    await dragGesture(page, viewport, cx, cy, 0, -200);
    checks.push(['Story : glisser vers le haut passe à la musique suivante', (await title()).includes('démonstration 3')]);
    await page.waitForTimeout(3300);
    checks.push(['Story : un titre YouTube sans extrait ne défile pas tout seul', (await title()).includes('démonstration 3')]);
    checks.push(['Story : le bouton ▶ ÉCOUTER DANS LOKI est proposé pour le titre YouTube', await page.locator('[data-testid="story-open-source-player"]').isVisible()]);
    await shot('story-youtube');
    await page.getByLabel('Fermer le swipe').first().click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
    // --- Aperçu du profil : le lecteur YouTube ouvert ne doit pas rendre le Swipe inerte.
    await page.getByLabel('Voir aperçu').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.getByLabel('Voir aperçu').first().click();
    await page.locator('[data-testid="swipe-neon-depth-card"]').waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(700);
    let guard = 0;
    while (!(await page.locator('[data-testid="swipe-exact-source-player"]').count()) && guard < 5) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(900);
      guard += 1;
    }
    const overlay = await page.locator('[data-testid="swipe-exact-source-player"]').boundingBox();
    checks.push(['Aperçu : le lecteur YouTube officiel s’ouvre sur un titre importé via YouTube', !!overlay]);
    if (overlay) {
      const before = await title();
      const gx = overlay.x + 18;
      const gy = overlay.y + overlay.height / 2;
      const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? el.tagName.toLowerCase() : ''; }, [gx, gy]);
      checks.push(['Aperçu : la gouttière du lecteur reste libre pour le geste (pas l’iframe)', hit !== 'iframe']);
      await dragGesture(page, viewport, gx, gy, -200, 0);
      const afterGesture = await title();
      checks.push(['Aperçu : glisser depuis la gouttière passe à la musique suivante', afterGesture !== before]);
      // Flèches du clavier (PC) : même geste, même quand l'iframe occupe la carte.
      if (viewport.width >= 1024) {
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(900);
        checks.push(['Aperçu PC : la flèche ↑ passe à la musique suivante', (await title()) !== afterGesture]);
      }
    }
    await shot('apercu-youtube');
    return {
      details: { overlay },
      failures: failed(checks),
      ok: 'Stories et aperçu du profil : Swipe fonctionnel, titres YouTube jouables et sans défilement automatique',
    };
  },
};

// Lecture d'un titre importé via YouTube depuis la liste du profil / de la playlist (incident 14/10/2026) :
// le bouton ▶ ouvrait YouTube hors de Loki. Il doit lire la source officielle DANS l'app, sur PC comme sur mobile.
const playYoutubeInAppJourney = {
  id: 'lecture-youtube-dans-loki',
  titre: 'Lecture d’un titre YouTube depuis la liste du profil, sans quitter Loki Music',
  devices: [PC, ANDROID],
  mobileFlags: true,
  fakeOptions: { pcSession: true, ownKeeps: true },
  async run({ page, shot }) {
    const checks = [];
    await page.goto(`${BASE}/Main/Profile/`, { waitUntil: 'load' });
    await page.getByText('Tous les morceaux', { exact: true }).first().waitFor({ state: 'visible', timeout: 35000 });
    await page.getByText('Tous les morceaux', { exact: true }).first().click();
    const play = page.getByLabel('Écouter ce morceau dans Loki Music').first();
    await play.waitFor({ state: 'visible', timeout: 20000 });
    const urlBefore = page.url();
    const pagesBefore = page.context().pages().length;
    await play.click();
    await page.waitForTimeout(1200);
    checks.push(['le lecteur officiel s’ouvre dans une fenêtre de Loki Music', await page.locator('[data-testid="embedded-source-modal"]').isVisible()]);
    checks.push(['le lecteur YouTube intégré est chargé (iframe)', (await page.locator('iframe').count()) >= 1]);
    checks.push(['l’utilisateur reste dans l’application (même adresse, aucun nouvel onglet)', page.url() === urlBefore && page.context().pages().length === pagesBefore]);
    await shot('lecteur-integre');
    await page.locator('[data-testid="embedded-source-close"]').click();
    await page.waitForTimeout(500);
    checks.push(['la fenêtre se ferme et le profil reste utilisable', (await page.locator('[data-testid="embedded-source-modal"]').count()) === 0]);
    return { details: {}, failures: failed(checks), ok: 'Le ▶ d’un titre YouTube lit la source dans Loki Music, sans redirection' };
  },
};

const JOURNEYS = [
  desktopPartiesBattleSidebarJourney,
  listenPcAndEventStoryJourney,
  swipeYoutubeJourney,
  playYoutubeInAppJourney,
  desktopHomeStoryJourney,
  pcConnectionCountdownJourney,
  crossDeviceReadJourney,
  popupJourney('FREE'),
  popupJourney('MONEY'),
  boutiqueJourney,
  chatGroupJourney,
  chatShareJourney,
  chatActionsJourney,
  groupAdminJourney,
  chatRedirectJourney,
  chatLiveJourney,
  chatUnreadJourney,
  chatMiniJourney,
  newKeepNotifJourney,
  battleArenaLayoutJourney,
  soloRechargeJourney,
];

// ---------------------------------------------------------------- exécution
function cell(s) { return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' '); }

function buildReport(results, meta) {
  const okCount = results.filter((r) => r.pass).length;
  const lines = [];
  lines.push('# Robot de parcours KEEP — rapport');
  lines.push('');
  lines.push(`- Date : ${meta.date}`);
  lines.push(`- Version testée : ${meta.sha}`);
  lines.push('- Navigateur : Chromium (faux Supabase synthétique, aucune donnée réelle, aucune écriture en production)');
  lines.push(`- Résultat : **${okCount}/${results.length} parcours réussis**${okCount === results.length ? ' ✅' : ' ❌'}`);
  lines.push('');
  lines.push('| Parcours | Appareil | Résultat | Détail |');
  lines.push('|---|---|---|---|');
  for (const r of results) lines.push(`| ${cell(r.titre)} | ${cell(r.appareil)} | ${r.pass ? '✅' : '❌'} | ${cell(r.raison)} |`);
  const withErrors = results.filter((r) => r.pageErrors.length);
  if (withErrors.length) {
    lines.push('');
    lines.push('## Erreurs JavaScript relevées dans la page (pour information)');
    for (const r of withErrors) lines.push(`- ${r.titre} — ${r.appareil} : ${r.pageErrors.map(cell).join(' / ')}`);
  }
  const withBlocked = results.filter((r) => r.blocked.length);
  if (withBlocked.length) {
    lines.push('');
    lines.push('## Appels externes coupés par le robot (pour information)');
    for (const r of withBlocked) lines.push(`- ${r.titre} — ${r.appareil} : ${[...new Set(r.blocked)].slice(0, 5).map(cell).join(' / ')}`);
  }
  lines.push('');
  lines.push('Captures d’écran : dossier `artifacts/journeys/captures/` (artefact « keep-journeys » de l’exécution GitHub Actions).');
  return lines.join('\n') + '\n';
}

(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error(`Export web introuvable : ${DIST}/index.html. Lancer d’abord « npx expo export --platform web --output-dir dist-journeys » dans packages/mobile.`);
    process.exit(2);
  }
  const shotsDir = path.join(OUT_DIR, 'captures');
  fs.mkdirSync(shotsDir, { recursive: true });
  const only = (process.env.JOURNEYS_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
  const selected = only.length ? JOURNEYS.filter((j) => only.includes(j.id)) : JOURNEYS;

  const pw = loadPlaywright();
  const launchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const server = await startServer();
  const browser = await pw.chromium.launch(launchOptions);
  const results = [];
  try {
    for (const journey of selected) {
      for (const [appareil, viewport] of journey.devices) {
        const started = Date.now();
        const { ctx, page, sb, pageErrors, blocked } = await openPage(browser, viewport, journey.fakeOptions, journey);
        const prefix = `${journey.id}-${slug(appareil)}`;
        const shot = (name) => page.screenshot({ path: path.join(shotsDir, `${prefix}-${name}.png`) }).catch(() => {});
        const entry = { id: journey.id, titre: journey.titre, appareil, pass: false, raison: '', pageErrors, blocked, details: null };
        try {
          const res = await journey.run({ page, sb, viewport, shot });
          entry.details = res.details;
          entry.pass = res.failures.length === 0;
          entry.raison = entry.pass ? res.ok : 'Échec : ' + res.failures.join(' ; ');
        } catch (e) {
          entry.raison = 'Échec : étape bloquée — ' + String(e && e.message ? e.message : e).split('\n')[0].slice(0, 220);
          await shot('erreur');
        }
        entry.duree_s = Math.round((Date.now() - started) / 1000);
        results.push(entry);
        console.log(`${entry.pass ? '✅' : '❌'} ${journey.titre} — ${appareil} (${entry.duree_s} s) : ${entry.raison}`);
        await ctx.close();
      }
    }
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  const report = buildReport(results, { date: new Date().toISOString(), sha: process.env.GITHUB_SHA || process.env.EXPO_PUBLIC_BUILD_SHA || 'locale' });
  fs.writeFileSync(path.join(OUT_DIR, 'RAPPORT.md'), report);
  fs.writeFileSync(path.join(OUT_DIR, 'resultats.json'), JSON.stringify(results, null, 1));
  console.log('\n' + report);
  process.exit(results.length > 0 && results.every((r) => r.pass) ? 0 : 1);
})().catch((e) => {
  console.error('Robot de parcours interrompu :', e);
  process.exit(1);
});

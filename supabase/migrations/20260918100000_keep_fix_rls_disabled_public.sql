-- Audit (17-18/09/2026) : advisor Supabase "RLS Disabled in Public" (ERROR)
-- trouve 2 tables publiques lisibles sans aucune policy -- l'API REST
-- (PostgREST) les expose donc potentiellement a n'importe qui.
--
-- 1) public.playlist_sale_offer_tracks (creee dans cette session, migration
--    20260918090000) : sans RLS, n'importe qui pourrait lire directement
--    QUELS morceaux sont dans une selection a vendre via l'API REST,
--    contournant completement le masquage cote RPC (keep_playlist_sale_*).
--    Meme regle que playlist_sale_offers elle-meme : le vendeur lit ses
--    propres lignes, la liste publique passe UNIQUEMENT par les fonctions
--    security definer existantes (qui restent inchangees, RLS ne les
--    affecte pas).
alter table public.playlist_sale_offer_tracks enable row level security;
drop policy if exists "playlist_sale_offer_tracks_read_own" on public.playlist_sale_offer_tracks;
create policy "playlist_sale_offer_tracks_read_own" on public.playlist_sale_offer_tracks for select using (
  exists (select 1 from public.playlist_sale_offers o where o.id = offer_id and o.seller_id = auth.uid())
);

-- 2) public.email_queue (ajoutee par un autre agent, resilience Brevo) :
--    contient des adresses email et des liens de reinitialisation de mot
--    de passe (metadata.action_link) -- sans RLS, potentiellement lisible
--    par n'importe qui via l'API REST. Seul le backend (service_role,
--    keep-auth-email / keep-email-retry-queue) doit jamais y toucher --
--    service_role contourne RLS de toute facon, donc RLS active SANS
--    aucune policy revient a interdire tout acces client (anon/authenticated),
--    exactement le comportement voulu.
alter table public.email_queue enable row level security;

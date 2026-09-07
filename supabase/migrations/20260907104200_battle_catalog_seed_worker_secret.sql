-- Cle partagee pour proteger keep-battle-catalog-seed (audit securite 07/09/2026).
-- La valeur brute est fournie a Adel une seule fois pour etre ajoutee comme secret
-- GitHub Actions (KEEP_BATTLE_CATALOG_WORKER_KEY) ; seul le hash est stocke ici.
insert into public.keep_internal_worker_secrets (name, secret_hash)
values ('battle-catalog-seed', 'dfd99c42ee551c23fc56d5f3801c389f6ec2f1c17b4c5553a856bd6ce4f7c9c3')
on conflict (name) do update set secret_hash = excluded.secret_hash;

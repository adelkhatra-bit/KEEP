-- Make every world style supported by keep-battle-catalog-seed reachable by the minute worker.
-- Pulse remains much broader (thousands of genres); this table is the curated Solo/Battle surface.

insert into public.keep_battle_themes(code,label,enabled,sort_order) values
  ('TECHNO','Techno',true,140),
  ('TRANCE','Trance',true,141),
  ('DNB','Drum & Bass',true,142),
  ('DUBSTEP','Dubstep',true,143),
  ('UK_GARAGE','UK Garage',true,144),
  ('GRIME','Grime',true,145),
  ('DRILL','Drill',true,146),
  ('PUNK','Punk',true,147),
  ('GOSPEL','Gospel',true,148),
  ('DANCEHALL','Dancehall',true,149),
  ('SALSA','Salsa',true,150),
  ('BACHATA','Bachata',true,151),
  ('CUMBIA','Cumbia',true,152),
  ('MERENGUE','Merengue',true,153),
  ('FLAMENCO','Flamenco',true,154),
  ('FADO','Fado',true,155),
  ('ZOUK','Zouk',true,156),
  ('KOMPA','Kompa',true,157),
  ('GNAWA','Gnawa',true,158),
  ('CHAABI','Chaabi',true,159),
  ('JPOP','J-Pop',true,160),
  ('ANIME','Anime / Anisong',true,161),
  ('CPOP','C-Pop / Cantopop',true,162),
  ('MANDOPOP','Mandopop',true,163),
  ('PUNJABI','Punjabi / Bhangra',true,164),
  ('AFROHOUSE','Afro House',true,165),
  ('LOFI','Lo-fi / Chillhop',true,166)
on conflict(code) do update
set label=excluded.label,enabled=true,sort_order=excluded.sort_order,updated_at=now();

insert into public.keep_battle_catalog_seed_state(theme_code,total_batches,priority)
select
  t.code,
  case t.code
    when 'CHANSON_FR' then 33
    when 'RAP_FR' then 12
    when 'POP' then 2
    when 'ROCK' then 2
    else 1
  end,
  case t.code
    when 'CHANSON_FR' then 1
    when 'RAP_FR' then 2
    else 100 + coalesce(t.sort_order,100)
  end
from public.keep_battle_themes t
where t.enabled=true
  and t.code = any(array['FUNK','DISCO','AFRO','RAP_FR','RAP_US','ELECTRO','POP','RNB','ROCK','LATINO','HOUSE','REGGAETON','AMAPIANO','ALTERNATIVE','COUNTRY','METAL','SOUNDTRACK','BLUES','TECHNO','TRANCE','DNB','DUBSTEP','UK_GARAGE','GRIME','DRILL','PUNK','GOSPEL','DANCEHALL','SALSA','BACHATA','CUMBIA','MERENGUE','FLAMENCO','FADO','ZOUK','KOMPA','GNAWA','CHAABI','KHALEEJI','EGYPTIAN_POP','JPOP','ANIME','CPOP','MANDOPOP','PUNJABI','AFROHOUSE','AFROPOP','LOFI','AMBIENT','FOLK','RAI','SOUL','REGGAE','JAZZ','CLASSIQUE','CHANSON_FR','ANNEES_80','ANNEES_90','RUSSE','TURC','KPOP','ARABE','BRESIL','INDE','DANCE','WORLD','HIPHOP','SERTANEJO','ARABIC_POP','AFRO_FUSION','BAILE_FUNK','PAGODE','HARD_ROCK','INDIE','LATIN_POP','MEXICAN','TROPICAL','VOCAL','SINGER_SONGWRITER','INSTRUMENTAL','NEW_AGE','CHRISTMAS','ANNEES_60','ANNEES_70','ANNEES_2000','ANNEES_2010','ANNEES_2020']::text[])
on conflict(theme_code) do update
set total_batches=excluded.total_batches,
    priority=excluded.priority,
    next_batch=least(public.keep_battle_catalog_seed_state.next_batch,excluded.total_batches),
    updated_at=now();

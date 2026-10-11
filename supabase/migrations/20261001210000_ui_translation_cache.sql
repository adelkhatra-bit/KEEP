create table if not exists public.ui_translation_cache (
  source_lang text not null,
  target_lang text not null,
  source_hash text not null,
  source_text text not null,
  translated_text text not null,
  provider text not null default 'GOOGLE_TRANSLATE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(source_lang,target_lang,source_hash)
);

alter table public.ui_translation_cache enable row level security;
revoke all on public.ui_translation_cache from anon, authenticated;

create index if not exists idx_ui_translation_cache_target
  on public.ui_translation_cache(target_lang,updated_at desc);

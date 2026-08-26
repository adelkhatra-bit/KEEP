-- KEEP identity must have exactly one public username regardless of casing.
-- Keep the most recently updated profile as the canonical spelling and rename
-- older duplicates without deleting any profile/data.
with ranked as (
  select
    id,
    username,
    row_number() over (
      partition by lower(username)
      order by updated_at desc nulls last, created_at desc, id desc
    ) as rn
  from public.profiles
), duplicates as (
  select id, username
  from ranked
  where rn > 1
)
update public.profiles p
set username = p.username || '-old-' || substr(replace(p.id::text, '-', ''), 1, 6),
    updated_at = now()
from duplicates d
where p.id = d.id;

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

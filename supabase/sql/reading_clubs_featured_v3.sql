-- Reading Clubs v3 — libro destacado de lectura actual del club.
-- featured: 'gold' (principal) | 'silver' (secundario) | null.
-- El índice único parcial garantiza COMO MUCHO un 'gold' y un 'silver' por club.

alter table public.books add column if not exists featured text;
alter table public.books drop constraint if exists books_featured_check;
alter table public.books add constraint books_featured_check check (featured in ('gold','silver'));

create unique index if not exists books_featured_uniq
  on public.books(community_id, featured)
  where featured is not null;

-- Reading Clubs v5 — votación de propuestas de libro.
-- vote: 'yes' | 'no' | 'later' (ahora no). Cuando todos los miembros activos votan
-- 'yes', el libro se aprueba (status -> 'reading'). El admin puede forzar el estado.

create table if not exists public.book_votes (
  community_id uuid not null references public.communities(id) on delete cascade,
  book_id      uuid not null references public.books(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  vote         text not null check (vote in ('yes','no','later')),
  created_at   timestamptz not null default now(),
  primary key (book_id, user_id)
);
create index if not exists book_votes_book_idx on public.book_votes(community_id, book_id);

alter table public.book_votes enable row level security;
drop policy if exists book_votes_no_access on public.book_votes;
create policy book_votes_no_access on public.book_votes for all using (false) with check (false);

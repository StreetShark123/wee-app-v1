-- Reading Clubs v7 — comentarios con hilos + reacciones emoji.
-- parent_id: respuesta a otro comentario (hilo). Reacciones para "agradecer/resonar"
-- (NO likes con leaderboard).

alter table public.book_comments add column if not exists parent_id uuid references public.book_comments(id) on delete cascade;
create index if not exists book_comments_parent_idx on public.book_comments(parent_id);

create table if not exists public.comment_reactions (
  community_id uuid not null references public.communities(id) on delete cascade,
  comment_id   uuid not null references public.book_comments(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  emoji        text not null,
  created_at   timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
create index if not exists comment_reactions_comment_idx on public.comment_reactions(community_id, comment_id);

alter table public.comment_reactions enable row level security;
drop policy if exists comment_reactions_no_access on public.comment_reactions;
create policy comment_reactions_no_access on public.comment_reactions for all using (false) with check (false);

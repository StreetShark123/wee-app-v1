-- v12: reacciones emoji en anotaciones de capítulo (igual que en comentarios).
create table if not exists public.note_reactions (
  community_id uuid not null references public.communities(id) on delete cascade,
  note_id      uuid not null references public.chapter_notes(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  emoji        text not null,
  created_at   timestamptz not null default now(),
  primary key (note_id, user_id, emoji)
);
create index if not exists note_reactions_note_idx on public.note_reactions(community_id, note_id);
alter table public.note_reactions enable row level security;

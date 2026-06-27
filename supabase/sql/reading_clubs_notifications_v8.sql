-- Reading Clubs v8 — notificaciones (menciones @ + respuestas a tus comentarios).
-- Sanas: solo lo dirigido a ti. kind: 'mention' | 'reply'.

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,   -- destinatario
  actor_id     uuid references public.community_users(id) on delete set null,           -- quién lo provocó
  kind         text not null check (kind in ('mention','reply')),
  book_id      uuid references public.books(id) on delete cascade,
  comment_id   uuid references public.book_comments(id) on delete cascade,
  text         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(community_id, user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists notifications_no_access on public.notifications;
create policy notifications_no_access on public.notifications for all using (false) with check (false);

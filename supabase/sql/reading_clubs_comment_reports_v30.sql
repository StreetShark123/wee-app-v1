-- v30 — Denuncia de comentarios/notas por cualquier miembro (antes solo existía
-- report para posts de enlaces). Da al miembro una palanca que no sea "discutir más".
create table if not exists public.comment_reports (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  comment_id   uuid not null references public.book_comments(id) on delete cascade,
  reporter_id  uuid not null,
  reason       text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  unique (community_id, comment_id, reporter_id)
);
create index if not exists comment_reports_community_idx
  on public.comment_reports (community_id) where resolved_at is null;

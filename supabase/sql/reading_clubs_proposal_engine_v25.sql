-- v25 — Motor de decisión de propuestas
-- (1) Plazo de votación por libro: al vencer, el backend (resolveExpiredProposals)
--     resuelve la propuesta con lo votado. Sin cron: se evalúa al listar libros.
-- (2) Nueva clase de notificación 'book_proposed': avisar a los miembros de que
--     hay una propuesta que votar (sin esto el quórum es inalcanzable).

alter table public.books
  add column if not exists vote_deadline timestamptz;

-- Backfill: las propuestas vivas arrancan con 7 días de plazo desde ahora.
update public.books
  set vote_deadline = now() + interval '7 days'
  where status = 'proposed' and vote_deadline is null;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('mention', 'reply', 'book_approved', 'book_finished', 'join_approved', 'promoted', 'book_proposed'));

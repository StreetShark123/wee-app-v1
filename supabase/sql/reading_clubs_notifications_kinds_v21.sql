-- v21 — amplía los tipos de notificación más allá de mention/reply.
-- Nuevos: book_approved (libro aprobado a lectura), book_finished (el club lo
-- terminó), join_approved (te aceptaron en el club), promoted (te hicieron admin).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('mention', 'reply', 'book_approved', 'book_finished', 'join_approved', 'promoted'));

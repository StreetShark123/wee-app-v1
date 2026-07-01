-- v32 — Notificación 'reminder': el organizador da un toque a quien aún no ha votado.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('mention','reply','book_approved','book_finished','join_approved','promoted','book_proposed','reaction','note_comment','reminder'));

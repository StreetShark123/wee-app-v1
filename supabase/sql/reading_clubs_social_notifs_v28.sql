-- v28 — Notificaciones sociales que faltaban (la "gasolina" de la conversación):
--   reaction     = alguien reaccionó (up) a tu comentario
--   note_comment = alguien comentó tu nota de capítulo
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('mention', 'reply', 'book_approved', 'book_finished', 'join_approved', 'promoted', 'book_proposed', 'reaction', 'note_comment'));

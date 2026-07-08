-- Nuevo kind de notificación: aviso al club cuando alguien nuevo se une.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in (
    'mention','reply','book_approved','book_finished','join_approved','promoted',
    'book_proposed','reaction','note_comment','reminder','meeting_set','member_joined'
  ));

-- v11: un comentario puede ser un "hilo sobre una anotación" (lo encabeza la nota).
alter table public.book_comments
  add column if not exists note_id uuid references public.chapter_notes(id) on delete set null;

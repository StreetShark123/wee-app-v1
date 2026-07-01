-- v22 — rediseño flujo de libros: estado 'rejected', votación Sí/No, fase de comentario.
-- 1) books.status admite 'rejected' (propuesta descartada, portada tachada, reabrible).
-- 2) book_votes deja de aceptar 'later' (se quita "ahora no"); se borran los existentes.
-- 3) book_comments.phase (proposed|reading): permite plegar la discusión de propuesta
--    al aprobar sin duplicar secciones de comentarios.

alter table public.books drop constraint if exists books_status_check;
alter table public.books
  add constraint books_status_check check (status in ('proposed', 'reading', 'finished', 'rejected'));

delete from public.book_votes where vote = 'later';
alter table public.book_votes drop constraint if exists book_votes_vote_check;
alter table public.book_votes
  add constraint book_votes_vote_check check (vote in ('yes', 'no'));

alter table public.book_comments add column if not exists phase text;
update public.book_comments bc
  set phase = case when b.status = 'proposed' then 'proposed' else 'reading' end
  from public.books b
  where b.id = bc.book_id and bc.phase is null;

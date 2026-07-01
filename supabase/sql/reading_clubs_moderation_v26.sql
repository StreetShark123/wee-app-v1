-- v26 — Moderación: marca de comentario retirado por moderación (vs borrado por el
-- autor). Permite que la lápida diga la verdad y ocultar en cascada el rastro
-- tóxico de un usuario baneado.
alter table public.book_comments
  add column if not exists moderated boolean not null default false;

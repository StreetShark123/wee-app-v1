-- v23 — destacar comentarios: los admins pueden fijar un comentario (estrella).
-- pinned_at: cuándo se destacó (null = normal). Se ordenan arriba en la UI.
alter table public.book_comments add column if not exists pinned_at timestamptz;

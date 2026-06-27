-- v10: comentarios editables (marca de editado) + borrado suave con lápida.
alter table public.book_comments add column if not exists edited_at timestamptz;
alter table public.book_comments add column if not exists deleted_at timestamptz;

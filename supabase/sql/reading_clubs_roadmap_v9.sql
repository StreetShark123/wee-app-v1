-- Reading Clubs v9 — D4 (comentarios por capítulo) + C1 (cadencia) + C3 (por qué lo
-- propongo) + C5 (quórum por mayoría configurable).

-- D4: anclar comentarios a un capítulo (anti-spoiler).
alter table public.book_comments add column if not exists chapter_id uuid references public.book_chapters(id) on delete set null;
create index if not exists book_comments_chapter_idx on public.book_comments(chapter_id);

-- C1: cadencia / meta de lectura por libro.
alter table public.books add column if not exists target_chapter int;
alter table public.books add column if not exists target_date date;

-- C3: nota de propuesta ("por qué lo propongo").
alter table public.books add column if not exists proposal_note text;

-- C5: modo de aprobación del club (mayoría por defecto, no unanimidad).
alter table public.communities add column if not exists approval_mode text not null default 'majority';
alter table public.communities drop constraint if exists communities_approval_mode_check;
alter table public.communities add constraint communities_approval_mode_check check (approval_mode in ('all','majority'));

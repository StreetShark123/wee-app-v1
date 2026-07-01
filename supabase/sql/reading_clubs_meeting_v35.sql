-- v35 — "La cita": fecha de discusión del club por libro (+ RSVP + aviso).
alter table public.books add column if not exists meeting_at timestamptz;
alter table public.books add column if not exists meeting_url text;
alter table public.books add column if not exists meeting_place text;

create table if not exists public.book_meeting_rsvp (
  community_id uuid not null,
  book_id      uuid not null references public.books(id) on delete cascade,
  user_id      uuid not null,
  status       text not null default 'yes' check (status in ('yes','no')),
  updated_at   timestamptz not null default now(),
  primary key (community_id, book_id, user_id)
);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mention','reply','book_approved','book_finished','join_approved','promoted','book_proposed','reaction','note_comment','reminder','meeting_set'));

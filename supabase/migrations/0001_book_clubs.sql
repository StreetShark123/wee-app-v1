-- Wee → Reading Clubs · core schema v1
-- Arquitectura: el frontend LEE tablas directo con la anon key; las ESCRITURAS y el
-- login pasan por la edge function (service role). Por eso: RLS con SELECT abierto en
-- tablas de dominio, y CERO acceso anon a datos sensibles (password_hash, sessions).

create extension if not exists "pgcrypto";

-- ───────────────────────────── Identidad (auth propia) ─────────────────────────────
create table profiles (
  id              uuid primary key default gen_random_uuid(),
  username        text not null,
  username_norm   text not null,
  email           text,
  password_hash   text,
  alias           text,
  avatar_color    text,
  avatar_data_url text,
  language        text not null default 'es',
  created_at      timestamptz not null default now()
);
create unique index profiles_username_norm_uniq on profiles(username_norm);
create unique index profiles_email_uniq on profiles(email) where email is not null;

create table sessions (
  token       text primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  scope       text not null default 'global',
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
create index sessions_user_idx on sessions(user_id);

-- Vista pública sin datos sensibles (lo que el front puede leer con anon key)
create view profiles_public as
  select id, username, alias, avatar_color, avatar_data_url, language, created_at
  from profiles;

-- ───────────────────────────── Clubs (antes comunidades) ───────────────────────────
create table clubs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  name_norm    text not null,
  invite_code  text not null,
  description  text,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index clubs_name_norm_uniq on clubs(name_norm);
create unique index clubs_invite_code_uniq on clubs(invite_code);

create table club_members (
  club_id   uuid not null references clubs(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index club_members_user_idx on club_members(user_id);

-- ───────────────────────────── Libros (por club) ───────────────────────────────────
-- source: 'google_books' | 'open_library' | 'manual'
-- manually_edited: true si un miembro ajustó la metadata indexada
-- status: 'proposed' | 'reading' | 'finished' (estado del libro en el club)
create table books (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references clubs(id) on delete cascade,
  added_by         uuid references profiles(id) on delete set null,
  isbn             text,
  title            text not null,
  author           text,
  cover_url        text,
  description      text,
  published_year   int,
  page_count       int,
  source           text not null default 'google_books',
  manually_edited  boolean not null default false,
  status           text not null default 'proposed',
  created_at       timestamptz not null default now()
);
create index books_club_idx on books(club_id);
create unique index books_club_isbn_uniq on books(club_id, isbn) where isbn is not null;

create table book_comments (
  id         uuid primary key default gen_random_uuid(),
  book_id    uuid not null references books(id) on delete cascade,
  user_id    uuid references profiles(id) on delete set null,
  text       text not null,
  created_at timestamptz not null default now()
);
create index book_comments_book_idx on book_comments(book_id);

-- ──────────────── Estantería personal + opinión final (galería de leídos) ───────────
-- shelf: 'want' | 'reading' | 'finished'
-- rating + review + finished_at = la reseña final que aparece en la galería
create table member_books (
  book_id     uuid not null references books(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  shelf       text not null default 'reading',
  rating      int check (rating between 1 and 5),
  review      text,
  finished_at timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (book_id, user_id)
);
create index member_books_user_idx on member_books(user_id);

-- ───────────────────────────── RLS ─────────────────────────────────────────────────
-- Sensibles: sin políticas → solo service_role (edge function) entra.
alter table profiles enable row level security;
alter table sessions enable row level security;

-- Dominio: SELECT abierto a anon; escrituras solo service_role (que ignora RLS).
alter table clubs         enable row level security;
alter table club_members  enable row level security;
alter table books         enable row level security;
alter table book_comments enable row level security;
alter table member_books  enable row level security;

create policy read_clubs         on clubs         for select using (true);
create policy read_club_members  on club_members  for select using (true);
create policy read_books         on books         for select using (true);
create policy read_book_comments on book_comments for select using (true);
create policy read_member_books  on member_books  for select using (true);

-- La vista pública hereda permisos; damos SELECT explícito al rol anon.
grant select on profiles_public to anon, authenticated;

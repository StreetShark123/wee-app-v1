-- ════════════════════════════════════════════════════════════════════════════
-- Wee Reading Clubs · INSTALADOR DESDE CERO (Opción A-real)
-- ════════════════════════════════════════════════════════════════════════════
-- Reproduce el schema final del backend de comunidades (community_v5 + v6 + v6.1 +
-- moderación) SIN los backfills de migración, y AÑADE el dominio de libros sobre
-- `community_id`. Pensado para un proyecto Supabase NUEVO/VACÍO.
--
-- Modelo de acceso: TODO pasa por la edge function `community-api` con service_role.
-- Por eso cada tabla tiene RLS habilitada + política deny-all (el service_role la
-- ignora). No hay políticas basadas en auth.uid() (la app no usa Supabase Auth JWT).
--
-- ⚠️ Destructivo: dropea las tablas del schema 0001 (club de lectura limpio) si
-- existen. Solo ejecutar en un proyecto sin datos que conservar.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── 0) Limpieza del schema 0001 (book-clubs limpio), si está presente ───────────
drop view  if exists public.profiles_public cascade;
drop table if exists public.member_books   cascade;
drop table if exists public.book_comments   cascade;
drop table if exists public.books           cascade;
drop table if exists public.club_members    cascade;
drop table if exists public.clubs           cascade;
drop table if exists public.sessions        cascade;
drop table if exists public.profiles        cascade;

-- ── 1) Identidad global (cuenta única que entra en varios clubs) ────────────────
create table if not exists public.global_users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique,
  username      text not null unique,
  username_norm text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.global_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.global_users(id) on delete cascade,
  session_token_hash text not null unique,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  revoked_at         timestamptz
);
create index if not exists global_sessions_user_idx on public.global_sessions(user_id, expires_at desc);

create table if not exists public.user_settings (
  user_id              uuid primary key references public.global_users(id) on delete cascade,
  default_community_id uuid,
  skip_picker          boolean not null default false,
  updated_at           timestamptz not null default now()
);

-- ── 2) Clubs (= communities) + membresías + perfil por club ─────────────────────
create table if not exists public.communities (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  name_norm           text not null,
  description         text,
  rules_text          text,
  invite_policy       text not null default 'admins_only' check (invite_policy in ('admins_only','members_allowed')),
  created_at          timestamptz not null default now(),
  created_by_user_id  uuid
);
create unique index if not exists communities_name_norm_unique on public.communities(name_norm);

alter table public.user_settings
  drop constraint if exists user_settings_default_community_fk;
alter table public.user_settings
  add constraint user_settings_default_community_fk
  foreign key (default_community_id) references public.communities(id) on delete set null;

-- Usuario "dentro de un club" (lo que requireSession pone en auth.user.id).
create table if not exists public.community_users (
  id               uuid primary key default gen_random_uuid(),
  community_id     uuid not null references public.communities(id) on delete cascade,
  alias            text not null,
  normalized_alias text not null,
  password_hash    text not null,
  avatar_url       text,
  language         text not null default 'es' check (language in ('es','en','gl')),
  created_at       timestamptz not null default now(),
  status           text not null default 'active' check (status in ('active','left','kicked')),
  global_user_id   uuid references public.global_users(id) on delete set null,
  unique (community_id, normalized_alias)
);
create index if not exists community_users_community_idx on public.community_users(community_id);

create table if not exists public.community_user_roles (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  role         text not null default 'member' check (role in ('admin','member')),
  created_at   timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references public.global_users(id) on delete cascade,
  status       text not null default 'active' check (status in ('active','left','kicked')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.community_profiles (
  id                uuid primary key default gen_random_uuid(),
  community_id      uuid not null references public.communities(id) on delete cascade,
  user_id           uuid not null references public.global_users(id) on delete cascade,
  community_user_id uuid not null unique references public.community_users(id) on delete cascade,
  display_name      text not null,
  display_name_norm text not null,
  avatar_url        text,
  language          text not null default 'es',
  created_at        timestamptz not null default now(),
  unique (community_id, user_id),
  unique (community_id, display_name_norm)
);

create table if not exists public.community_invites (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  code         text not null,
  token        text not null,
  created_by   uuid references public.community_users(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  revoked_at   timestamptz,
  unique (code),
  unique (token)
);
create index if not exists community_invites_community_idx on public.community_invites(community_id);
create index if not exists community_invites_code_upper_idx on public.community_invites(upper(code));

-- Sesión de club (token hash). OJO: forma v5 (id/community_id/session_token_hash).
create table if not exists public.sessions (
  id                 uuid primary key default gen_random_uuid(),
  community_id       uuid not null references public.communities(id) on delete cascade,
  user_id            uuid not null references public.community_users(id) on delete cascade,
  session_token_hash text not null unique,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  revoked_at         timestamptz
);
create index if not exists sessions_user_idx on public.sessions(user_id, community_id);
create index if not exists sessions_active_idx on public.sessions(community_id, user_id, revoked_at, expires_at);

-- Mantener el código de invitación en mayúsculas.
create or replace function public.uppercase_invite_code()
returns trigger language plpgsql as $$
begin
  new.code := upper(new.code);
  return new;
end;
$$;
drop trigger if exists trg_uppercase_invite_code on public.community_invites;
create trigger trg_uppercase_invite_code
before insert or update on public.community_invites
for each row execute function public.uppercase_invite_code();

-- ── 3) Tablas sociales (legado de noticias; vacías, para que bootstrap no rompa) ─
create table if not exists public.posts (
  id                   uuid primary key default gen_random_uuid(),
  community_id         uuid not null references public.communities(id) on delete cascade,
  user_id              uuid not null references public.community_users(id) on delete cascade,
  created_at           timestamptz not null default now(),
  status               text not null default 'active' check (status in ('active','collapsed','removed')),
  removed_by           uuid references public.community_users(id) on delete set null,
  removed_at           timestamptz,
  removed_reason       text,
  url                  text,
  canonical_url        text,
  title                text,
  text                 text,
  preview_title        text,
  preview_description  text,
  preview_image_url    text,
  preview_site_name    text,
  source_domain        text,
  topics               text[] not null default array['misc']::text[],
  subtopics            text[] not null default '{}',
  topic_v2             text,
  topic_candidates_v2  jsonb,
  topic_explanation_v2 jsonb,
  topic_version        text,
  quality_label        text not null default 'medium',
  quality_score        int  not null default 50,
  interest_score       int  not null default 50,
  flags                text[] not null default '{}',
  rationale            text[] not null default '{}',
  normalized_text      text not null default ''
);
create index if not exists posts_community_created_idx on public.posts(community_id, created_at desc);
create unique index if not exists posts_canonical_url_unique on public.posts(canonical_url) where canonical_url is not null;

create table if not exists public.comments (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  post_id      uuid not null references public.posts(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  text         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists comments_community_post_created_idx on public.comments(community_id, post_id, created_at desc);

create table if not exists public.post_votes (
  community_id uuid not null references public.communities(id) on delete cascade,
  post_id      uuid not null references public.posts(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  vote         smallint not null check (vote in (-1,1)),
  voted_at     timestamptz not null default now(),
  primary key (community_id, post_id, user_id)
);

create table if not exists public.post_shares (
  community_id   uuid not null references public.communities(id) on delete cascade,
  post_id        uuid not null references public.posts(id) on delete cascade,
  user_id        uuid not null references public.community_users(id) on delete cascade,
  share_count    int not null default 1,
  last_shared_at timestamptz not null default now(),
  primary key (community_id, post_id, user_id)
);

create table if not exists public.post_opens (
  community_id uuid not null references public.communities(id) on delete cascade,
  post_id      uuid not null references public.posts(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  opened_at    timestamptz not null default now(),
  primary key (community_id, post_id, user_id)
);

create table if not exists public.comment_aura (
  community_id uuid not null references public.communities(id) on delete cascade,
  comment_id   uuid not null references public.comments(id) on delete cascade,
  user_id      uuid not null references public.community_users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (community_id, comment_id, user_id)
);

create table if not exists public.post_reports (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  post_id      uuid not null references public.posts(id) on delete cascade,
  reporter_id  uuid not null references public.community_users(id) on delete cascade,
  reason       text not null,
  created_at   timestamptz not null default now(),
  unique (community_id, post_id, reporter_id)
);

create table if not exists public.user_preferences (
  community_id     uuid not null references public.communities(id) on delete cascade,
  user_id          uuid not null references public.community_users(id) on delete cascade,
  preferred_topics text[] not null default '{}',
  blocked_domains  text[] not null default '{}',
  blocked_keywords text[] not null default '{}',
  updated_at       timestamptz not null default now(),
  primary key (community_id, user_id)
);

-- ── 4) Dominio de LIBROS (club de lectura) sobre community_id ───────────────────
-- status: 'proposed' | 'reading' | 'finished' (todos lo terminaron)
-- total_chapters: nullable; si se define, habilita el seguimiento por capítulos.
create table if not exists public.books (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references public.communities(id) on delete cascade,
  added_by        uuid references public.community_users(id) on delete set null,
  isbn            text,
  title           text not null,
  author          text,
  cover_url       text,
  description     text,
  published_year  int,
  page_count      int,
  total_chapters  int,
  source          text not null default 'google_books' check (source in ('google_books','open_library','manual')),
  manually_edited boolean not null default false,
  status          text not null default 'proposed' check (status in ('proposed','reading','finished')),
  created_at      timestamptz not null default now()
);
create index if not exists books_community_created_idx on public.books(community_id, created_at desc);
create unique index if not exists books_community_isbn_uniq on public.books(community_id, isbn) where isbn is not null;

create table if not exists public.book_comments (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  book_id      uuid not null references public.books(id) on delete cascade,
  user_id      uuid references public.community_users(id) on delete set null,
  text         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists book_comments_book_idx on public.book_comments(community_id, book_id, created_at);

-- Estantería + progreso por miembro (1 fila por libro×usuario).
create table if not exists public.member_books (
  community_id  uuid not null references public.communities(id) on delete cascade,
  book_id       uuid not null references public.books(id) on delete cascade,
  user_id       uuid not null references public.community_users(id) on delete cascade,
  shelf         text not null default 'reading' check (shelf in ('want','reading','finished')),
  chapters_done int not null default 0,
  rating        int check (rating between 1 and 5),
  review        text,
  finished_at   timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (community_id, book_id, user_id)
);
create index if not exists member_books_user_idx on public.member_books(community_id, user_id);

-- ── 5) RLS deny-all en TODO (solo service_role / edge function) ─────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'global_users','global_sessions','user_settings',
    'communities','community_users','community_user_roles','community_members',
    'community_profiles','community_invites','sessions',
    'posts','comments','post_votes','post_shares','post_opens','comment_aura',
    'post_reports','user_preferences',
    'books','book_comments','member_books'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_no_access', t);
    execute format('create policy %I on public.%I for all using (false) with check (false);', t || '_no_access', t);
  end loop;
end $$;

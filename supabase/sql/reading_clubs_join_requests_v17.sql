-- v17: solicitudes de unión para clubs privados.
create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  unique (community_id, user_id)
);
create index if not exists join_requests_community_status on public.join_requests (community_id, status);
alter table public.join_requests enable row level security;

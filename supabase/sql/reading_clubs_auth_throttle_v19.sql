-- v19 — rate limiting server-side para autenticación.
-- Contador por clave (acción:IP o acción:usuario) con ventana deslizante simple.
-- La edge function (service_role) la lee/escribe; deny-all como el resto.

create table if not exists public.auth_throttle (
  key text primary key,
  count int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.auth_throttle enable row level security;
drop policy if exists auth_throttle_no_access on public.auth_throttle;
create policy auth_throttle_no_access on public.auth_throttle for all using (false) with check (false);

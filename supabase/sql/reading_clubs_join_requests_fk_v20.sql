-- v20 — integridad referencial de join_requests.
-- user_id guarda global_users.id; decided_by guarda community_users.id (el admin
-- que decidió). Sin FK antes → filas huérfanas al borrar usuarios. Añadimos FKs
-- consistentes con lo que cada columna almacena.

-- Limpia huérfanos por si acaso (no debería haber).
delete from public.join_requests jr
  where not exists (select 1 from public.global_users g where g.id = jr.user_id);
update public.join_requests
  set decided_by = null
  where decided_by is not null
    and not exists (select 1 from public.community_users cu where cu.id = decided_by);

alter table public.join_requests drop constraint if exists join_requests_user_fk;
alter table public.join_requests
  add constraint join_requests_user_fk foreign key (user_id)
  references public.global_users(id) on delete cascade;

alter table public.join_requests drop constraint if exists join_requests_decided_by_fk;
alter table public.join_requests
  add constraint join_requests_decided_by_fk foreign key (decided_by)
  references public.community_users(id) on delete set null;

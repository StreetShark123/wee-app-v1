-- v16: URL propia por club (slug) + visibilidad (public/private/invite).
alter table public.communities add column if not exists slug text;
alter table public.communities add column if not exists visibility text not null default 'public';

-- Backfill de slug desde el nombre (sin acentos básicos vía regexp; minúsculas, guiones).
update public.communities c
  set slug = nullif(trim(both '-' from regexp_replace(lower(coalesce(c.name, 'club')), '[^a-z0-9]+', '-', 'g')), '')
  where c.slug is null;
update public.communities set slug = 'club' where slug is null or slug = '';

-- Desambiguar duplicados: el más antiguo conserva el slug; el resto recibe sufijo del id.
update public.communities c
  set slug = c.slug || '-' || substr(c.id::text, 1, 4)
  where c.id in (
    select id from (
      select id, row_number() over (partition by slug order by created_at) rn
      from public.communities
    ) t where t.rn > 1
  );

create unique index if not exists communities_slug_unique on public.communities (slug);

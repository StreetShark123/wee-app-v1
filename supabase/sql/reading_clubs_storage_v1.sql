-- Storage para medios del club (avatares y, más adelante, imágenes de nota).
-- Antes las imágenes se guardaban como data-URL base64 en la BD y viajaban
-- EMBEBIDAS en cada respuesta JSON (listas, feed, notificaciones) → egress
-- recurrente que agotó la cuota (lección 2026-07). Con Storage el JSON lleva
-- una URL corta y la imagen se sirve una vez (y la cachea el service worker).
--
-- Bucket PÚBLICO: la lectura por URL pública no pasa por RLS; la escritura la
-- hace solo la edge function con service_role (que salta RLS). No hacen falta
-- políticas extra sobre storage.objects para este flujo.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wee-media',
  'wee-media',
  true,
  2097152, -- 2 MB (el cliente comprime muy por debajo)
  array['image/png','image/jpeg','image/gif','image/webp','image/avif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

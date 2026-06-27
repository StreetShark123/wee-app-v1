# Wee — Club de Lectura — notas para agentes

App web (Vite + React 18 + TS + Supabase) — **club de lectura**. El pivote desde la
vieja app de "curación de noticias" está **hecho**: usuarios → crean/entran en clubs →
proponen libros → el club vota → lectura por capítulos (progreso por usuario) → notas e
hilos de debate anti-spoiler → valoración/reseña al terminar → estante de "leídos".
Instalable como **PWA**.

## ⭐ Principio rector del producto (LÉELO ANTES DE DISEÑAR NADA)

Lo PRINCIPAL de esta app es ser **user-friendly de verdad** y centrada en la
**comunidad**. Toda decisión de UX/feature se valida contra esto:

- **Premia lo positivo**: compartir, comentar, leer juntos, ayudar. Las acciones que
  refuerzan comunidad se celebran (cualitativo), nunca se convierten en competición.
- **CERO embudos de engagement vacío ni patrones oscuros**: nada de rachas, rankings
  de velocidad, métricas de vanidad, notificaciones-cebo, FOMO, ni "enganche por
  enganche". Si una feature solo existe para subir un número de uso, NO va.
- **Transparencia de uso**: que se entienda en todo momento cómo funciona la app y qué
  hace cada acción. Sin trucos ni dark patterns.
- **Transparencia de datos**: el uso de datos debe ser **visible para todos los
  usuarios — admin o no —** dentro de lo razonable y funcional. Nada de datos ocultos
  sobre la gente que no pueda ver la propia gente. La persona puede ver, exportar y
  borrar lo suyo.
- **Sin monetización ni cobros** (decisión histórica del dueño).

Las ideas de futuro viven en [docs/IDEAS.md](docs/IDEAS.md) (ojo a la tensión
gamificación ↔ "sin rankings": cualquier "medalla/wrap-up" debe ser celebración
cualitativa, no competición). El plan e historia de fases:
[docs/READING_CLUB_PLAN.md](docs/READING_CLUB_PLAN.md).

## Arquitectura (cómo está montado HOY)

- **Backend = una sola edge function** `supabase/functions/community-api/index.ts`
  (objeto path→handler, `requireSession(req)`). **TODO el dominio pasa por aquí con
  `service_role`**: las tablas tienen RLS deny-all, no hay lecturas anon directas.
  - Proyecto Supabase desplegado: `wee-reading-clubs` (ref `djwieglfowxvjvrqcefn`),
    linkado al CLI. "Usuario en un club" = `community_users.id` (= `auth.user.id`).
  - Aplicar/consultar BD: `supabase db query --linked -f archivo.sql` (sin Docker).
    Desplegar función: `supabase functions deploy community-api --project-ref djwieglfowxvjvrqcefn`.
  - El esquema se instaló con `supabase/sql/install_reading_clubs_v1.sql` y se fue
    extendiendo con migraciones `reading_clubs_*_vN.sql` (v2 capítulos … v13 notas
    editables). El `0001_book_clubs.sql` original quedó **obsoleto/reemplazado**.
- **`book-search`** es una edge function aparte (Google Books / Open Library); se llama
  por `fetch` desde `src/lib/bookSearch.ts` (el cliente `@supabase/supabase-js` se
  **retiró** del bundle).
- **Frontend**: `src/lib/communityApi.ts` (cliente HTTP único), `src/lib/appData.ts`
  (`useAppData`, "cerebro" de datos), pantallas en `src/pages/`, componentes en
  `src/components/`. Estado de la ficha con updates optimistas (`patch()`), no se
  recarga la página por acción.
  - NOTA: queda código muerto del legado de "posts/noticias" (`posts`, `aura`,
    `topics`) que **ya no se renderiza** y **no se carga** (bootstrap con
    `include_posts:false`). No lo revivas; bórralo si estorba.

## Dominio (dónde vive cada cosa)

- **Libros/estanterías**: `src/pages/HomePage.tsx` + `src/components/BookCard.tsx`;
  endpoints `/books/list|create|get|update|set_status|set_target|feature|vote|delete`.
- **Ficha de libro** (la pantalla densa): `src/pages/BookDetailPage.tsx` (cerebro) +
  `src/components/ChapterTimeline.tsx` (capítulos + notas) +
  `src/components/CommentThread.tsx` (comentarios agrupados por capítulo).
- **Capítulos/progreso**: `/chapters/set|toggle|complete_all`; **notas**:
  `/chapters/note/add|update|delete|react` (tipos nota/referencia/pregunta, media
  YouTube/imagen/enlace, reacciones emoji, hilos encabezados por la nota vía `note_id`).
- **Comentarios**: `/books/comment`, `/comments/update|delete|react` (hilos 1 nivel,
  editar deja "editado", borrar deja lápida si hay respuestas, @menciones+notifs,
  anti-spoiler: grupo de capítulo colapsado hasta marcarlo leído).
- **Perfil público**: `/users/profile`; **export propio**: `/data/export_me`.
- **Notificaciones**: `/notifications/list|read` (solo mención/respuesta).

## Convenciones de UI/código

- `react-router-dom` con **HashRouter** (`/#/...`). Rutas vivas: `/login` `/signup`
  `/communities` `/join` `/invite/:token` `/home` `/book/:bookId` `/profile/:userId`
  `/settings` `/community`. (Las viejas `/topic` `/post` `/share` ya no existen.)
- **PWA**: `vite-plugin-pwa` (manifest standalone + service worker Workbox autoUpdate);
  iconos en `public/icon-*.png` (generados desde `public/icon.svg`). Botón "Instalar"
  en `AppFooter` (`useInstallPrompt`).
- **CSS**: un único `src/styles/global.css`. Hay **tokens** en `:root` (radios
  `--radius-sm/md/lg/pill`, foco `--focus`, espaciado `--sp-1..6`, `--tag-font`,
  acentos). Color semántico: verde=hecho/sí, púrpura=referencia, amarillo=pregunta,
  azul `--brand`=activo/seleccionado. Guardarraíl `npm run design:lint`.
- **Animación**: `framer-motion` vía `m` + `LazyMotion` (features diferidas). Modales =
  `.modal-overlay`/`.modal-card`; confirmaciones con `useConfirm()` (`src/lib/confirm.tsx`),
  NO `window.confirm`.
- App **solo español** hoy (`language = "es"` fijo en `App.tsx`); i18n soporta es/en/gl
  pero las cadenas gl/en están a medio rellenar. UI minúscula, tono cercano.

## Verificación

- `npm run typecheck` — tsc (red de seguridad principal de refactors).
- `npm run test` — vitest.
- `npm run design:lint` — guardarraíles de UX (`scripts/design_lint.mjs`).
- `npm run check` — typecheck + test + design:lint (todo junto).
- `npm run build` — autoritativo (tsc + vite build; genera manifest + SW de la PWA).
- `npm run dev` — dev server. Requiere `VITE_SUPABASE_*` (depende del backend remoto).
- **Gotcha iCloud**: el repo vive en Documents (sincronizado); aparecen duplicados
  `«Archivo 2.ext»` que rompen `design:lint`/build. Si los ves, bórralos (untracked).

## Convención de docs

- Documentación de producto/arquitectura en `docs/`. Mantén
  `docs/READING_CLUB_PLAN.md` al día al cerrar trabajo. Ideas futuras → `docs/IDEAS.md`.

# Wee → Club de Lectura — notas para agentes

App web (Vite + React + TS + Supabase) que **está pivotando** de "curación de
noticias por comunidades" a **club de lectura**. La meta: usuarios → crean/entran
en clubs → en cada club se añaden libros → cada libro tiene comentarios,
seguimiento de capítulos por usuario y votación; cuando todos terminan, el libro
queda "leído".

El plan completo, el estado fase-a-fase y el análisis de huecos están en
**[docs/READING_CLUB_PLAN.md](docs/READING_CLUB_PLAN.md)** — léelo antes de tocar
dominio de libros/clubs.

## ⚠️ Gotcha #1: el CÓDIGO y la BASE DE DATOS desplegada NO coinciden

Verificado contra el Supabase remoto el 2026-06-27 (`supabase db query --linked`).
No te fíes de los docs viejos (README/DATA_MODEL) ni de los nombres: el código habla
de "comunidades/posts", pero el proyecto Supabase desplegado es otra cosa.

- **Lo que el CÓDIGO asume** (NO desplegado en este proyecto): backend de noticias.
  - Edge function `supabase/functions/community-api/index.ts` (CRUD de comunidades/posts).
  - SQL `supabase/sql/community_v5.sql`, `community_v6_*`, `moderation_v4.sql`, `admin_v3.sql`.
  - Tablas que espera: `global_users`, `communities`, `community_users`, `posts`,
    `comments`, `post_votes`, etc.
  - Frontend: `src/lib/communityApi.ts`, `src/lib/appData.ts` (`useAppData`),
    `src/lib/types.ts` (`Post`). **El "libro" de la UI es un `Post` re-etiquetado**
    (clasifica URLs, calcula "aura"). Es la app de noticias con copy de libros.

- **Lo que está DESPLEGADO de verdad** (proyecto `wee-reading-clubs`,
  ref `djwieglfowxvjvrqcefn`, creado 2026-06-26, linkado al CLI):
  - **Solo** el schema limpio de `supabase/migrations/0001_book_clubs.sql`:
    `clubs, club_members, profiles, profiles_public, books, book_comments,
    member_books, sessions`. **Todas las tablas VACÍAS (0 filas).**
  - Edge functions desplegadas: **solo `book-search`**. `community-api` NO está desplegada.
  - **NO existen** `communities`, `community_users`, `global_users`, `posts`, etc.
  - → El frontend y `community-api` apuntan a tablas que aquí no existen: la app de
    comunidades **no funciona contra esta BD**. Este proyecto es el lienzo nuevo del pivot.

### Gotcha #1b: el alta de libro está rota (WIP)
`App.tsx > onAddBook` inserta en `books` con el cliente **anon**. La RLS de `0001`
permite SELECT anon pero la INSERT solo `service_role` → bloqueado. Además el código
pasa un id de comunidad que aquí no significa nada. El camino correcto es un endpoint
en una edge function con `service_role`. Ver plan, Fase 1.

### Implicación: la decisión "Opción A" se tomó con premisa falsa
"Reutilizar el backend de comunidades que ya funciona y está desplegado" — ese backend
**no está desplegado aquí**. La decisión está RE-ABIERTA con la info correcta; ver el
plan (§ "Decisión re-abierta"). No implementes dominio de libros hasta cerrarla.

## Lo que SÍ funciona ya (reutilizable)
- Auth global (registro/login/logout) + sesión por cookie/token: `community-api` `/auth/*_global`.
- Multi-club real: un usuario en varios `communities` vía `community_members`.
- Invitaciones por código/link, roles admin/member, crear/entrar/salir de club.
- Búsqueda de libros (Google Books / Open Library): `supabase/functions/book-search/index.ts`
  + `src/lib/bookSearch.ts` + `src/components/AddBookModal.tsx`. Devuelve metadata normalizada.

## Lo que falta para la visión (no existe en NINGÚN schema)
- **Seguimiento de capítulos por usuario** — no hay tabla. `member_books.shelf`
  (`want|reading|finished`) es demasiado grueso. Necesita progreso por capítulo.
- **Regla "todos completaron → leído"** — no hay agregación. `books.status` existe
  (`proposed|reading|finished`) pero nada lo calcula.
- **UI de comentarios de libro** (`book_comments`) — tabla sí, UI/endpoint no.
- **UI de votación/rating al terminar** (`member_books.rating/review`) — tabla sí, UI no.

## Decisión arquitectónica: ✅ A-real (tomada y EJECUTADA 2026-06-27)
Se desplegó el backend de comunidades EN este proyecto y se extendió con libros.
El schema `0001` (clubs/profiles vacío) fue **dropeado y reemplazado**. Estado real ahora:
- **DB desplegada** = instalador `supabase/sql/install_reading_clubs_v1.sql` aplicado:
  comunidades + auth global + posts (vacío, legado) + **books/book_comments/member_books**
  con `community_id`, todo RLS deny-all. Verificado end-to-end (auth→club→libro).
- **Edge functions desplegadas**: `community-api` (con endpoints `/books/list`,
  `/books/create`) + `book-search`.
- El "usuario en un club" = `community_users.id` (= `auth.user.id` de `requireSession`).
- Aplicar/consultar la BD: `supabase db query --linked` (CLI linkado, sin Docker).
  Desplegar funciones: `supabase functions deploy <slug>`.

## Stack y rutas
- Vite + React 18 + TS, `react-router-dom` con **HashRouter** (`/#/...`).
- Framer Motion (animaciones). En el modelo VIVO **todo** (lectura y escritura) pasa
  por la edge function con `service_role`: las tablas de dominio tienen RLS deny-all,
  no hay lecturas anon directas. (El cliente anon `supabase` solo se usa hoy para
  `book-search`/`onAddBook` WIP, que justamente por eso falla — ver Gotcha #1b.)
- App **solo español** de momento (`language = "es"` fijo en `App.tsx`), aunque i18n soporta es/en/gl.
- Rutas vivas: `/login` `/signup` `/communities` `/join` `/invite/:token` `/home`
  `/topic/:topic` `/post/:postId` `/share` `/profile/:userId` `/settings` `/community`.

## Verificación
- `npm run typecheck` — tsc (red de seguridad principal).
- `npm run test` — vitest.
- `npm run design:lint` — guardrails de UX (`scripts/design_lint.mjs`).
- `npm run check` — typecheck + test + design:lint (todo junto).
- `npm run build` — tsc -b + vite build (autoritativo).
- `npm run dev` — dev server. Requiere variables `VITE_SUPABASE_*` o la app no arranca
  (depende de backend remoto; ver README "Limitación importante").

## Convención
- Documentación de producto/arquitectura en `docs/`. El plan del pivot manda:
  `docs/READING_CLUB_PLAN.md`. Mantenlo al día cuando cierres una fase.
- Idioma de la app y de la copy: español. UI minúscula, tono cercano.
</content>
</invoke>

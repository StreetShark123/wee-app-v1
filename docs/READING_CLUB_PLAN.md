# Plan: Wee → Club de Lectura

> Doc vivo. Estado a 2026-06-27. Mantener al día al cerrar cada fase.
> Resumen rápido para agentes en `CLAUDE.md` (raíz).

## 1. Visión de producto

Una app de **clubs de lectura**:

1. Los usuarios se registran (cuenta global, ya existe).
2. Crean o se unen a **clubs** (uno o varios por usuario).
3. Dentro de cada club se **añaden libros** (buscados por título/autor/ISBN o a mano).
4. Cada libro permite:
   - **Comentarios** del club.
   - **Seguimiento de capítulos completados por cada usuario** (progreso de lectura).
   - **Votación / valoración** cuando un usuario lo termina.
5. Cuando **todos los miembros** terminan un libro, queda marcado como **leído**
   (entra en la "galería de leídos" del club).

## 2. Estado actual (qué hay construido)

> ⚠️ **Verificado contra el Supabase remoto el 2026-06-27** (`supabase db query
> --linked`, proyecto `wee-reading-clubs` / `djwieglfowxvjvrqcefn`). Los docs viejos
> (README, DATA_MODEL) describen un backend que **NO está desplegado en este proyecto**.

### 2.0 Realidad del backend desplegado (la fuente de verdad)
- El proyecto linkado `wee-reading-clubs` (creado 2026-06-26) tiene **solo** el schema
  de `supabase/migrations/0001_book_clubs.sql`: `clubs, club_members, profiles,
  profiles_public, books, book_comments, member_books, sessions`. **Todo VACÍO (0 filas).**
- Edge functions desplegadas: **solo `book-search`**. `community-api` y `unfurl` NO están.
- **NO existen** `communities`, `community_users`, `global_users`, `posts`, `comments`,
  `post_votes`, etc. → El código de comunidades/posts **no funciona contra esta BD**.
- Es decir: el "backend vivo de comunidades" que se asumía abajo **es código, no despliegue**.
  Este proyecto es el lienzo nuevo del pivot, provisionado con el schema limpio + búsqueda.

La app nació como **curación de noticias por comunidades**. El pivot a club de
lectura **ya empezó pero está a medias**. En el REPO conviven dos modelos de datos;
en la BASE DE DATOS solo está desplegado el segundo (el limpio).

### 2.1 Modelo VIVO (el que el backend ejecuta hoy) — noticias re-etiquetadas

- **Edge function** `supabase/functions/community-api/index.ts`: hace TODO el CRUD
  real con `service_role`. Auth global, clubs (como `communities`), membresías,
  invitaciones, roles, posts, votos, comentarios, aura, moderación.
- **SQL aplicado**: `supabase/sql/community_v5.sql` + `community_v6_global_multi.sql`
  + `community_v6_1_unique_name.sql` + `moderation_v4.sql` + `admin_v3.sql`.
- **Tablas vivas**: `global_users`, `global_sessions`, `user_settings`,
  `communities`, `community_members`, `community_users`, `community_profiles`,
  `community_user_roles`, `community_invites`, `sessions`, `posts`, `comments`,
  `post_votes`, `post_shares`, `post_opens`, `comment_aura`, `post_reports`,
  `user_preferences`, `rate_limit_events`.
- **Frontend**:
  - `src/lib/communityApi.ts` — cliente HTTP contra la edge fn.
  - `src/lib/appData.ts` (`useAppData`) — cerebro de estado de la app.
  - `src/lib/store.ts`, `src/lib/types.ts` (`Post`, `User`, etc.).
  - `src/App.tsx` — orquesta todo: comparte URL → `enrich` → `classify` (aura/topics)
    → dedup → `createPost`. **El "libro" de la UI es un `Post`.** La copy en español
    dice "libro", pero la mecánica sigue siendo de noticias (URLs, aura, duplicados).

### 2.2 Modelo NUEVO de club de lectura (dibujado, NO cableado)

- **Migración** `supabase/migrations/0001_book_clubs.sql` — schema limpio:
  - `profiles` (+ `sessions`) — identidad propia (distinta de `global_users`).
  - `clubs`, `club_members` — clubs (distintos de `communities`).
  - `books` — libros por club: `isbn,title,author,cover_url,description,
    published_year,page_count,source,status('proposed'|'reading'|'finished')`.
  - `book_comments` — comentarios por libro.
  - `member_books` — estantería personal: `shelf('want'|'reading'|'finished')`,
    `rating(1-5)`, `review`, `finished_at`. (La "opinión final" de la galería.)
  - RLS: SELECT abierto a anon; **escrituras solo `service_role`**.
- **No está conectado al backend.** La edge fn viva usa `communities`/`global_users`,
  no `clubs`/`profiles`. Son dos universos.

### 2.3 Búsqueda de libros (esto SÍ está bien y es reutilizable)

- `supabase/functions/book-search/index.ts` — edge fn que consulta Google Books /
  Open Library y normaliza resultados.
- `src/lib/bookSearch.ts` — cliente (`searchBooks`, `resultToDraft`, `emptyDraft`).
- `src/components/AddBookModal.tsx` — modal de 2 fases: buscar → revisar/editar →
  confirmar. Soporta alta 100% manual. Conectado en `App.tsx` (FAB en `/home`).

### 2.4 Lo que está ROTO / a medio cablear

- `App.tsx > onAddBook` inserta en `books` con el cliente **anon**
  (`supabase.from("books").insert(...)`). Pero:
  - La RLS de `0001_book_clubs.sql` solo deja escribir a `service_role` → **bloqueado**.
  - `books.club_id → clubs(id)`, pero la sesión activa trae un id de `communities`
    (no de `clubs`, que está vacía) → **falla la FK**.
  - → Hoy añadir un libro **no funciona** contra ese schema. Es WIP.

## 3. Análisis de huecos (visión vs. lo construido)

| # | Requisito de la visión | Estado | Dónde |
|---|------------------------|--------|-------|
| 1 | Crear usuarios | ✅ Vivo | `community-api` `/auth/register_global`, `login_global` |
| 2 | Crear clubs | ⚠️ Vivo como `communities`; el `clubs` nuevo está vacío | `/community/create_global`; `0001` define `clubs` aparte |
| 3 | Usuario en uno o varios clubs | ✅ Vivo (multi-tenant real) | `community_members`, `/communities/list`, `/community/enter` |
| 4 | Añadir libros por club | ⚠️ Búsqueda OK; **guardado roto** (RLS/FK) | `book-search`, `AddBookModal`, `onAddBook` |
| 5 | Comentarios por libro | ❌ Tabla `book_comments` existe; sin endpoint ni UI | — |
| 6 | Seguimiento de capítulos por usuario | ❌ **No existe en ningún schema** | `member_books.shelf` es demasiado grueso |
| 7 | Votar/valorar al terminar | ❌ Tabla `member_books.rating/review` existe; sin UI/endpoint | — |
| 8 | "Todos completaron → leído" | ❌ No hay agregación; `books.status` existe pero nada lo calcula | — |

## 4. Decisión A vs B (resolver ANTES de implementar dominio de libros)

El backend vivo (`communities/posts`) y el schema limpio (`clubs/books`) no pueden
coexistir indefinidamente. Hay que elegir un eje.

### Opción A — Extender el backend vivo: "post = libro"
Reutilizar `communities` (como clubs) y modelar libros/capítulos/progreso como
tablas nuevas colgando de la edge fn existente, añadiendo endpoints
`/books/*`, `/book/comments/*`, `/book/progress/*`.

- ➕ Reusa auth global, multi-club, invitaciones, roles, rate-limit, moderación —
  todo lo que ya está probado y desplegado.
- ➕ Migración incremental: no rompes lo que funciona.
- ➖ Arrastras nombres/legado de noticias (`posts`, `aura`, `topics`) que habrá que
  ignorar o limpiar; el `App.tsx` actual mezcla mucho.

### Opción B — Migrar al schema limpio `0001_book_clubs.sql`
Reconectar la edge function a `clubs/books/profiles` y reescribir el dominio.

- ➕ Modelo conceptualmente limpio, sin deuda de noticias.
- ➖ Reescribir auth (ya hay `profiles`+`sessions` en `0001`, pero la edge fn usa
  `global_users`), invitaciones, roles, membresías. **Mucho** trabajo ya resuelto en A.
- ➖ Riesgo de regresión alto; tiras infraestructura probada.

### ✅ Decisión: A-real (Axel, 2026-06-27) — EJECUTADA (Fase 1)
Tras descubrir que el backend de comunidades NO estaba desplegado (solo el schema
limpio `0001` vacío), Axel eligió **A-real**: desplegar comunidades aquí y extender con
libros. Hecho — ver Fase 1 (§5). El schema `0001` se dropeó. Para contexto histórico,
las dos opciones que se evaluaron eran:

**A-real — desplegar el backend de comunidades aquí y extenderlo**
Aplicar `community_v5.sql` + `community_v6_*` + `moderation_v4` + `admin_v3` a este
proyecto, desplegar `community-api`, y añadir libros como tablas con `community_id`.
- ➕ Máximo reuso del **código** existente (auth global, multi-club, invitaciones,
  roles, picker, `communityApi.ts`, `appData.ts`, los 1500L de `community-api`).
- ➕ Frontend de auth/club/invites/perfil queda casi tal cual.
- ➖ Arrastra todo el legado de noticias (posts/aura/topics) a limpiar luego.
- ➖ Conviven en la BD el schema de comunidades y el limpio `0001` (este último se dropea).

**B-real — construir sobre el schema limpio `0001` ya desplegado**
Cablear la app a `clubs/profiles/books` (que ya existen y están vacíos).
- ➕ Modelo conceptualmente limpio, sin deuda de noticias; la BD ya está lista.
- ➖ Reescribir auth (de `global_users`+`community-api` a `profiles`+`sessions` de `0001`),
  la capa de datos del frontend y crear los endpoints desde cero. Se pierde el reuso
  del picker multi-club / invitaciones / roles ya pulidos.

**Recomendación:** depende de qué pesa más, ¿el código pulido o el modelo limpio?
- Si prima **enviar rápido reutilizando lo construido** → **A-real**.
- Si prima **base limpia a largo plazo** y no importa reescribir auth/datos → **B-real**.

**Convenciones de backend que cualquier opción debe seguir** (de `community_v5.sql`):
- Tablas de dominio con FK al club (`community_id` en A-real, `club_id` en B-real),
  `on delete cascade`.
- **RLS deny-all** + acceso solo por edge function con `service_role` (no lecturas
  anon directas). Nota: el `0001` actual abre SELECT a anon — en B-real decidir si se
  mantiene (lecturas directas) o se cierra (todo por edge function).
- El "usuario dentro del club": `community_users.id` (A-real) o `profiles.id` (B-real).

## 5. Plan por fases (asumiendo Opción A)

Cada fase termina verde en `npm run check` (typecheck + test + design:lint).

### Fase 0 — Decisión y limpieza de andamiaje
- Confirmar A vs B con Axel.
- Decidir destino de `0001_book_clubs.sql`: reescribir sus tablas con `community_id`
  (FK → `communities`) y RLS service-role, o documentarlo como referencia.
- Inventariar qué de la UI de noticias se reusa y qué se retira (feed, topics, aura, share-URL).

### Fase 1 — Alta de libros que funcione (cierra hueco #4) — ✅ HECHA 2026-06-27
- ✅ Instalador `supabase/sql/install_reading_clubs_v1.sql` aplicado al remoto
  (dropea `0001`, instala comunidades+auth+posts+libros, RLS deny-all).
- ✅ Endpoints `community-api` `/books/create` y `/books/list` (`requireSession`,
  `service_role`); helpers `rowToBook`/`rowToMemberBook`. Función desplegada.
- ✅ Cliente FE `listClubBooks`/`createClubBook` + tipos `ClubBook`/`MemberBook` en
  `communityApi.ts`. `onAddBook` (App.tsx) reescrito al endpoint.
- ✅ `/home` reescrita: estantería de libros (`BookCard` + `book-grid` CSS), reemplaza
  el feed de noticias. Búsqueda por título/autor + estado vacío con CTA.
- ✅ Verificado: typecheck + 17 tests + design:lint + build; smoke de schema y
  **smoke HTTP end-to-end** (register→club→enter→books/create→books/list) OK.
- SIN COMMITEAR. Pendiente: validación visual en navegador (la auth/onboarding real).
- Rutas de posts (`/topic`, `/post`) siguen existiendo pero ya no se enlazan desde home.

### Fase 2 — Ficha de libro + comentarios (cierra hueco #5) — ✅ HECHA 2026-06-27
- ✅ Ruta `/book/:bookId` → `src/pages/BookDetailPage.tsx` (portada, metadata, sinopsis,
  miembros, comentarios). `BookCard` vuelve a ser navegable.
- ✅ Endpoints `community-api`: `/books/get` (libro+comentarios+progreso de miembros+myMember),
  `/books/comment`. Cliente FE `getClubBook`/`addBookComment`.

### Fase 3 — Seguimiento de capítulos por usuario (cierra hueco #6) — ✅ HECHA 2026-06-27
- Modelo **simple** elegido (Google NO indexa capítulos de forma fiable; Open Library
  irregular): `books.total_chapters` (manual) + `member_books.chapters_done` (contador).
- ✅ Endpoints `/books/set_chapters` (solo quien lo añadió o admin), `/books/progress`.
  UI: barra de progreso + "voy por el capítulo N" en la ficha.
- Futuro (rico, si se pide): tabla `chapters` + completar capítulos sueltos / TOC best-effort.

### Fase 4 — Terminar + valorar (cierra hueco #7) — ✅ HECHA 2026-06-27
- ✅ Endpoint `/books/finish` (shelf='finished', finished_at, chapters_done=total,
  rating 1-5 + review). UI: "marcar terminado" + estrellas de valoración en la ficha.

### Fase 5 — "Todos completaron → leído" — ✅ HECHA (base) 2026-06-27
- ✅ Helper `recomputeBookStatus` (en `/books/progress` y `/books/finish`): si TODOS los
  `community_users` activos del club tienen shelf='finished' → `books.status='finished'`;
  si hay progreso → 'reading'; si no → 'proposed'. Verificado end-to-end.
- **Definición de "todos" = miembros activos del club** (decisión por defecto). Pregunta
  de producto abierta: ¿quórum %? ¿congelar la lista al empezar el libro?
- Pendiente: **galería de "leídos"** del club con ratings/reseñas agregados (no hecha).

### Fase 5.5 — Capítulos con nombre + anotaciones + timeline — ✅ HECHA 2026-06-27
- SQL `supabase/sql/reading_clubs_chapters_v2.sql` (aplicado): `book_chapters`,
  `chapter_completions` (checkmark por usuario), `chapter_notes` (anotaciones note/reference).
- Endpoints `community-api`: `/chapters/set` (corta-y-pega del índice; solo adder/admin;
  reemplaza lista y resetea progreso), `/chapters/toggle` (marca capítulo + recomputa
  member_books y status), `/chapters/note/add`. `/books/get` ahora devuelve `chapters[]`
  con `doneByMe`/`completedCount`/`notes`.
- FE: `src/lib/parseChapters.ts` (regex: por líneas o por marcadores "Capítulo N"),
  `src/components/ChapterTimeline.tsx` (checklist vertical + notas por capítulo),
  `BookDetailPage` usa el timeline y el corta-y-pega. `member_books.chapters_done` se
  deriva de los checkmarks. Verificado end-to-end (set→toggle→note→get).
- Sustituye el contador simple de Fase 3 cuando hay capítulos con nombre (el contador
  numérico se retiró del UI; `books.total_chapters` se sincroniza = nº de capítulos).

### Fase 5.6 — Libro destacado de lectura del club (oro/plata) — ✅ HECHA 2026-06-27
- SQL `supabase/sql/reading_clubs_featured_v3.sql` (aplicado): `books.featured`
  ('gold'|'silver'|null) + índice único parcial `(community_id, featured)` → como
  mucho un oro y un plata por club.
- Endpoint `community-api` `/books/feature` (solo admin): libera el color del libro
  anterior y lo asigna al nuevo. `rowToBook` devuelve `featured`.
- FE: `setBookFeatured`; `BookCard` muestra bandera (oro="Lectura actual",
  plata="Siguiente") y `HomePage` ordena destacados primero; `BookDetailPage` da
  controles de admin para marcar Principal/Secundaria. Verificado (el oro "se roba").

### Fase 5.7 — Pulido de ficha de libro — ✅ HECHA 2026-06-27
- Checks de capítulo mucho más claros (círculo → verde con tachado al leer); fila de
  capítulo entera clicable; "Leído" + nº de lectores.
- Capítulos: además de pegar el índice, opción **"nº de capítulos"** (obras numeradas
  sin título → "Capítulo 1..N").
- Notas de capítulo: **imagen opcional** (`chapter_notes.image_url`) + **enlaces**
  auto-clicables (`Linkify`). Botón "Añadir nota". Endpoint note/add y /books/get
  devuelven `imageUrl`.
- **Editar libro** (`/books/update`, adder/admin): portada (URL), título, autor,
  sinopsis — para cuando Google falla. Verificado end-to-end.
- Sección "Quién lo está leyendo" (marcar capítulo = apareces como lector).
- ⏳ APLAZADO (subfeatures grandes): hilos de comentarios DENTRO de cada nota;
  subir imágenes (hoy es por URL, no upload a Storage); auditoría CSS completa.

### Fase 5.8 — Ciclo de vida del libro (propuesta→votación→lectura→leído) — ✅ HECHA 2026-06-27
- Estanterías en home por estado: **Propuestas · En lectura · Leídos** (`books.status`).
- **Votación** de propuestas (`book_votes`: yes/no/later). **Todos los miembros activos
  votan 'yes' → aprobado (status='reading')**. Endpoint `/books/vote`.
- **Admin fuerza estado** (`/books/set_status`: proposed/reading/finished).
- `recomputeBookStatus` redefinido: **"todos = los que lo están leyendo"** (no todos los
  miembros). Si entra un lector nuevo, vuelve a 'reading'. Respeta 'proposed'.
- **Principal único (oro)** entre las de lectura; **plata eliminada**.
- **"Marcar todo como leído"** (`/chapters/complete_all`).
- **Valoración solo al marcar TODOS los capítulos**; lista de capítulos **colapsa**;
  **reseña** opcional (visible en lectores cuando el libro está 'finished').
- **Layout**: `.home-books` igualada al ancho del header (main=1180; antes 1040).
- ⏳ Sigue aplazado: hilos de comentarios en notas, upload de imágenes (Storage),
  auditoría CSS integral.

### Fase 5.9 — Cache de búsqueda + ajustes de ficha — ✅ HECHA 2026-06-27
- **Cache de book-search** (`book_search_cache`, TTL 30 días): la edge function consulta
  cache antes de llamar a Google/Open Library; respuesta marca `cached:true`. Menos
  llamadas externas y más rápido. Verificado (2ª llamada cacheada).
- **Notas de capítulo solo visibles tras leerlo** (`doneByMe`) — anti-spoiler; si hay
  notas y no lo has leído, muestra "N nota(s) — léelo para verlas".
- **Fix**: texto de capítulos no leídos era negro (el `<button>` heredaba color) → `--ink-0`.
- **Un solo botón "Añadir libro"** (el del hero): quitado el botón "Recomendar libro" del
  TopBar, el FAB flotante y el `ShareLinkModal` legacy de App.

### Fase 6 — Limpieza de legado de noticias (EN CURSO)
- ✅ Ronda 2: quitadas las rutas de noticias `/topic` `/post` `/share`
  `/profile/:id/posts` + borradas sus páginas (TopicPage, PostDetailPage, SharePage,
  UserPostsPage) + componentes huérfanos (ShareLinkModal, CommentsPanel, EmojiMenu).
  Enlace "Mis libros/posts" retirado del TopBar. Typecheck/tests/build verdes.
- ✅ Ronda 3: `App.tsx` 1373→712 líneas (quitados ~14 handlers de posts muertos:
  onShareUrl/onRatePost/onAdmin*/dedup) + imports muertos podados + `enrich.ts` borrado.
- ✅ Auditoría CSS: `global.css` 5788→3869 líneas (271 reglas muertas del news-app
  eliminadas con script conservador; clases vivas book-/chapter-/vote- intactas;
  design:lint OK). 220 clases muertas detectadas, ~190 retiradas.
- ⏳ Queda: `ProfilePage` sigue post-céntrica (es además la edición de alias/avatar →
  modernizar a "perfil lector"); ancla `auraEngine/topicEngineV2/topicForum/topicColors/
  PostCard/appData(posts)` + las notificaciones por-post (se reusará para @menciones).
- ✅ Borrados 7 archivos muertos (0 referencias): `IconGallery`, `AppSkeleton`,
  `TopicBlock`, `FiltersBar`, `PostDetailModal`, `LoginPage`, `InviteRedirectPage`.
- ✅ JoinPage rediseñada: por enlace muestra "Te han invitado a {club}" + 2 botones
  (ya tengo cuenta / crear cuenta nueva), sin pedir código (viene en la URL). El
  campo de código solo aparece en entrada manual a `/join` sin enlace.
- ⏳ PENDIENTE (refactor grande, riesgo medio — hacerlo enfocado y verificado):
  rutas de noticias `/topic` `/post` `/share` `/profile/:id/posts` + sus páginas
  (TopicPage, PostDetailPage, SharePage, UserPostsPage) siguen ruteadas. Están muy
  entrelazadas: ProfilePage es post-céntrica, TopBar enlaza a `/profile/:id/posts`,
  NotificationsMenu a `/post/:id`, y `useAppData`/App tienen toda la maquinaria de
  posts (onShareUrl, onRatePost, aura, classify, topicEngineV2, enrich, PostCard,
  CommentsPanel, EmojiMenu, ShareLinkModal). Quitarlo exige rediseñar ProfilePage
  (→ "libros leídos del usuario"), TopBar y notificaciones (→ eventos de libro).
- Renombrar copy y tipos (`Post`→`Book`) de forma incremental y verificada.
- Actualizar README (sigue describiendo "curación de noticias").

## 6. Preguntas de producto abiertas
- "Todos completaron": ¿miembros activos en ese instante, o quórum configurable?
- ¿Un club lee un libro "a la vez" (libro activo) o varios en paralelo? (`books.status`
  sugiere estados por libro, no un único activo.)
- ¿Votación = rating 1-5 por persona, o un voto agregado tipo "me gustó / no"?
- ¿Capítulos: el que añade el libro define el total, o se autocompleta desde `page_count`?
- ¿Mantener invitaciones por código/link tal cual? (ya funciona).

## 7. Punteros rápidos de código
- Orquestador FE: `src/App.tsx` (`onAddBook` ~L1000; rutas ~L1114+; FAB libro ~L1414).
- Estado/datos: `src/lib/appData.ts` (`useAppData`), `src/lib/communityApi.ts`, `src/lib/store.ts`.
- Backend: `supabase/functions/community-api/index.ts` (handlers por path al final del archivo).
- Búsqueda libros: `supabase/functions/book-search/index.ts`, `src/lib/bookSearch.ts`, `src/components/AddBookModal.tsx`.
- Schema libros (referencia): `supabase/migrations/0001_book_clubs.sql`.
- SQL vivo: `supabase/sql/community_v5.sql`, `community_v6_*.sql`, `moderation_v4.sql`, `admin_v3.sql`.
</content>

## 8. Roadmap acordado (2026-06-27) — backlog priorizado

Consolida: feedback directo de Axel + revisión UX/UI (2 agentes) + buenas prácticas de
clubs de lectura. **Principio rector (no negociable): UX centrado en usuario y comunidad;
CERO monetización, embudos, rankings de velocidad, rachas ni patrones oscuros.**

### A. Feedback directo de Axel (prioridad alta — son ajustes concretos pedidos)
- **A1 · Datos por estantería en las cards.** En *Leídos*: mostrar la **nota media de la
  comunidad**. En *En lectura*: **nº de lectores activos** + **última actualización**.
  (Backend: exponer en `/books/list` por libro: avgRating, readersActivos, lastActivityAt.)
- **A2 · Espacio hero↔header.** El bloque buscar+"Añadir libro" está pegado al header sin
  margen → añadir separación (`.books-hero` margin-top / el contenedor home).
- **A3 · Skeletons + datos ágiles.** Skeletons para la rejilla de libros y la ficha
  (`/book/:id`) para que cargar sea *smooth* sin saltos (evitar CLS). Diseño de skeleton
  acorde a cada página. + **Caché de datos en cliente** (libros del club, ficha) para que
  navegar sea fluido y no re-pegue al backend cada vez. (Reusar/ampliar `store.ts` cache;
  `react-query`-lite a mano o cache en memoria + revalidar.)
- **A4 · Quitar el tag de estado de las cards.** El badge "En lectura/Propuesto/Leído" es
  **redundante** ahora que hay estanterías separadas → retirarlo de `BookCard`.
- **A5 · Ficha: separar edición (admin) del contenido (usuarios).** Estado, "quitar
  principal", etc. → ocultos tras un botón **"Editar" (solo admin)**; el espacio principal
  queda para **sinopsis/título/autor** y la **lista de lectura** accesible a todos.
  (Coincide con UX P1-6.)
- **A6 · Botón "volver a estantería" mejor integrado.** Ahora está solo en su propia fila;
  integrarlo (p.ej. en la cabecera de la ficha junto al título, o como flecha compacta).

### B. Revisión UX/UI — pendientes (de la auditoría con agentes)
- **B1 (P0) · Votación transparente.** Mostrar **quórum** ("3/5 a favor para empezar"),
  toast al votar, y aclarar las dos vías de aprobación (todos-sí **o** admin).
- **B2 (P1) · "Reemplazar capítulos" es destructivo y escondido** → confirmación explícita
  + estilo de peligro (`--danger`).
- **B3 (P1) · Unificar términos de estado** entre card, ficha y copy (un único set i18n).
- **B4 (P2) · Accesibilidad varia:** `aria-live` en estados de carga; picker de comunidades
  operable por teclado (hoy `article onClick`); botón limpiar en la búsqueda.
- **B5** · Aplicado ya: contraste `--ink-1`, áreas táctiles ≥44px, aria de valoración,
  3 estanterías siempre visibles.

### C. Buenas prácticas de club (features nuevas, alto valor comunitario)
- **C1 · Cadencia/meta por libro** ("esta semana hasta el cap. 7 · faltan 3 días") sobre el
  timeline existente. Atada al libro principal. Rótulo visible, sin pings agresivos.
- **C2 · Preguntas de debate sembradas** (`chapter_notes.kind = 'prompt'`) que aparecen al
  marcar el capítulo leído. Matan la página vacía. Reusa el modelo de notas.
- **C3 · "Por qué lo propongo"** (frase corta en la propuesta) — se vota un argumento, no
  una portada. `books.proposal_note`.
- **C4 · Galería de "leídos"** del club con notas medias y reseñas (memoria/identidad).
  NO convertir en ranking competitivo entre miembros.
- **C5 · Quórum por mayoría (no unanimidad)** configurable + congelar lista de lectores al
  pasar a 'reading' (un miembro tardío no resetea a todos). Resuelve § "Preguntas abiertas".
- **C6 · Estante "Para más adelante"** para libros votados "ahora no" (no se borran).
- **C7 · Rol "facilitador del libro"** (quien lo propone) distinto del admin del club.

### D. Feature de comentarios (petición explícita — debate ordenado)
- **D1 · Reacciones emoji** a comentarios/notas — para *agradecer/resonar*, NO como likes
  con leaderboard. Sin contadores que generen ansiedad.
- **D2 · @menciones** que notifican solo al mencionado + **responder a un comentario →
  hilos**. Reusa el shell de notificaciones (se dejó vivo a propósito).
- **D3 · Notificaciones sanas:** mención y respuesta a lo tuyo = sí; "alguien comentó en el
  club" = resumen agregado y opcional. Default conservador, control granular (silenciar libro/club).
- **D4 · Comentarios anclables a capítulo** (`book_comments.chapter_id` opcional) con el
  mismo muro anti-spoiler que las notas (ocultos hasta leer ese capítulo).

### Anti-patrones a NO implementar (confirmados con la filosofía de Axel)
Rankings de velocidad de lectura · rachas/streaks · notificación por cada evento ·
spoilers visibles por defecto · poder concentrado solo en admin · borrado duro de
propuestas · métricas de vanidad como objetivo · onboarding que exige cuenta antes de ver
el club al que te invitan.

### Orden sugerido de ejecución
1. **A2 + A4 + A6** (ajustes rápidos de UI) · 2. **A3** (skeletons + caché — hace todo
   más fluido) · 3. **A1** (datos por estantería) · 4. **A5 + B2 + B1** (ficha: edición
   admin separada, destructivo seguro, votación transparente) · 5. **D (comentarios)** ·
   6. **C (buenas prácticas)** empezando por C4 galería, C2 prompts, C1 cadencia.

### Estado de ejecución del roadmap (2026-06-27)
- ✅ **A1** datos por estantería · **A2** espacio hero · **A3** skeletons + caché ·
  **A4** quitar tag estado · **A5** edición admin agrupada · **A6** breadcrumb volver.
- ✅ **B1** quórum de votación · **B2** redefinir capítulos seguro · **B5** (contraste,
  táctil, aria, 3 estanterías). Pendientes B3 (unificar copy estado) + B4 (a11y picker/aria-live).
- ✅ **D1** reacciones emoji · **D2 (hilos)** respuestas con threads.
  ⏳ Pendiente **D2 (notificaciones)** + **D3** (@menciones + sistema de notificaciones
  sano, reusando el shell de NotificationsMenu) + **D4** (comentarios anclados a capítulo,
  anti-spoiler).
- ⏳ **C** (buenas prácticas) sin empezar: prioridad C4 galería de leídos, C2 preguntas de
  debate, C1 cadencia, C3 "por qué lo propongo", C5 quórum configurable, C6 "para más
  adelante", C7 facilitador.

### Actualización (2026-06-27, cont.)
- ✅ **D2/D3** @menciones + sistema de notificaciones (tabla `notifications`, parseo
  @alias + respuesta-a-tu-comentario; NotificationsMenu reescrito; refresco on focus).
- ✅ **C2** preguntas de debate (chapter_notes kind='prompt', anti-spoiler heredado).
- ⏳ Quedan: **D4** (comentarios anclados a capítulo), **B3/B4** (copy estado + a11y),
  **C1** cadencia, **C3** "por qué lo propongo", **C4** galería de leídos, **C5** quórum
  configurable, **C6** "para más adelante", **C7** facilitador.

### Actualización (2026-06-27, sprint roadmap final)
- ✅ **D4** comentarios anclables a capítulo + anti-spoiler (book_comments.chapter_id).
- ✅ **C1** cadencia/meta (target_chapter/date, /books/set_target, banner + control).
- ✅ **C3** "por qué lo propones" (books.proposal_note) en alta + mostrado al votar.
- ✅ **C5** aprobación por MAYORÍA por defecto (communities.approval_mode) — núcleo hecho;
  falta solo el toggle admin en CommunityPage (plumbing por useAppData).
- ✅ **C6** estante "Para más adelante" (votos 'ahora no' dominantes).
- ✅ **C7** facilitador del libro (= quien lo propuso), mostrado "Facilita: X".
- ✅ Editar/borrar comentarios + @menciones con autocompletado + fin de recargas de ficha.
- ✅ **C4** galería de leídos: cubierta por nota media en cards (A1) + reseñas en ficha.
- ⏳ Pendiente menor: toggle quórum admin (C5 UI), B3/B4 (copy/a11y), revisión móvil/redundancias.

### Estado FINAL (2026-06-28) — producto listo

Cerrado todo el backlog del roadmap (A/B/C/D) **y** varias rondas de pulido por
revisión multiagente. Resumen de lo que quedó en pie:

- **Dominio completo**: propuesta → votación (mayoría/admin, quórum visible, "ahora no"
  → "para más adelante") → lectura por capítulos (progreso por usuario, "marcar todo")
  → notas por capítulo (nota/referencia/pregunta con tag de color, media YouTube/
  imagen/enlace + **lightbox**, **reacciones emoji**, **editar/borrar** propias, **hilos
  encabezados por la nota**) → comentarios **agrupados por capítulo y colapsados hasta
  leerlo** (anti-spoiler), hilos 1 nivel, editar("editado")/borrar(lápida), reacciones,
  **@menciones con teclado** + notificaciones (que llevan al comentario) → valoración +
  reseña → estante de **leídos** + **perfil público** (leídos, nota media, reseñas).
- **Transparencia (principio rector)**: panel "Cómo usamos tus datos" + opt-out de
  analytics; "Roles y moderación" (qué puede/NO puede un admin); **export solo-tuyo**
  (`/data/export_me`); reconocimiento cálido al terminar (sin gamificación).
- **PWA instalable** (manifest standalone + service worker + iconos + botón instalar).
- **Calidad**: CSS tokenizado (radios/foco/espaciado/tags; verde=hecho, púrpura=
  referencia, amarillo=pregunta), picker de reacciones bottom-sheet en móvil, modal de
  confirmación propio (`useConfirm`, fuera `window.confirm`), panel de gestión en
  "Datos del libro" / "Gestión de la lectura", supabase-js fuera del bundle, posts
  legacy ya no se cargan.

**Pendiente (proceso/deuda menor, NO bloquea):**
- Rama `feat/reading-clubs` **sin mergear a `main`** (a la espera de decisión de Axel).
- i18n **gl/en a medio rellenar** (la app es solo-español hoy; cuando se activen otros
  idiomas, barrido de cadenas).
- Toggle admin de modo de quórum en `CommunityPage` (el backend ya lo soporta).

# Sistema de color — wee

Tema **"papel · máquina de escribir · tinta"**: base cálida (crema/sepia), tinta oscura,
y una familia de acentos usados con **restricción y significado**. Regla de oro: el papel
manda; el color es un **acento funcional**, nunca relleno. Antes casi todo vivía sobre el
mismo crema y solo se usaba el teal → sensación plana. Este sistema reparte los acentos ya
existentes por **rol semántico** para dar jerarquía sin salir del tema.

Todos los valores son tokens en `src/styles/global.css` (`:root`). Nunca hardcodees un hex.

## 1. Superficies (escalera de papel)
Dan profundidad por capas, no por sombras fuertes.

| Token | Uso |
|---|---|
| `--bg-0` / `--bg-1` | Fondo de la app (el papel más profundo). |
| `--panel-0` | Tarjetas y secciones elevadas. |
| `--panel-1` | Insets, chips, contadores, píldoras. |
| `--line` | Bordes y separadores. |

Regla: máximo **2 niveles de superficie** apilados. Una tarjeta (`panel-0`) no lleva dentro
otra tarjeta `panel-0`; usa `panel-1` para lo de dentro.

## 2. Tinta (texto)
| Token | Contraste | Uso |
|---|---|---|
| `--ink-0` `#2a241b` | 13:1 | Texto principal, títulos. |
| `--ink-1` `#5a5142` | ~6:1 | Secundario, meta, fechas, hints. |

Nunca bajes de `--ink-1` para texto (AA). El gris más claro solo para bordes/decoración.

## 3. Marca
| Token | Uso |
|---|---|
| `--brand` `#2f6a66` (teal) | **Acciones primarias** (Añadir libro, Guardar), identidad del club. |
| `--brand-strong` | Hover/pressed de la marca, anillo de foco (`--focus`). |

El teal es la voz principal. No lo uses para estados; para eso están los semánticos.

## 4. Color semántico por ESTADO del libro
El cambio clave contra la planitud: **cada estante/estado tiene su acento**. Deriva de la
paleta de acentos ya existente.

| Estado | Token | Color | Lectura |
|---|---|---|---|
| En lectura | `--status-reading` | menta `#3e6b4f` | activo, en marcha |
| Propuesta | `--status-proposed` | ámbar `#b07a2b` | pendiente de decisión, cálido |
| Leído | `--status-finished` | violeta `#6e4b7a` | terminado/archivado (distinto del verde) |
| Descartado | `--status-rejected` | `--ink-1` apagado | fuera de juego |
| Actividad reciente | `--live` | ámbar | "en vivo", lo nuevo |

**Cómo se aplica** (patrón reutilizable):
- **Marcador**: un cuadradito/lomo de 10px del color del estado antes del título de sección
  (`.shelf-title::before`).
- **Contador tintado**: la píldora del nº usa `color: <status>` + `background:
  color-mix(<status> 13% + panel-0)`. Nunca el color plano de fondo (muy saturado); siempre
  un `color-mix` al 7–15% sobre papel.
- **Superficie tintada** (`--tint-reading`/`--tint-proposed`/`--tint-live`): fondos MUY
  suaves (7–9%) para separar una sección sin romper el papel. Reservado para zonas "vivas"
  (la tira de actividad) o para diferenciar estantes; no para tarjetas normales.

## 5. Semánticos de sistema
| Token | Uso |
|---|---|
| `--success` `#3e6b4f` | Confirmaciones, progreso completado, capítulo leído (verde). |
| `--warning` `#b07a2b` | Avisos, plazos, pendientes (ámbar). |
| `--danger` `#9a3b2e` | Acciones destructivas, errores, baneo. |
| `--ink-scarlet` `#b5382b` | Rojo "sello/LED": destacado, portada featured, carga. |
| `--stamp` | Tachado de descartados. |

## 6. Acentos disponibles (reserva)
`--accent-violet` `#6e4b7a`, `--accent-coral` `#b5503f`. Aún sin rol asignado; úsalos solo
si aparece una categoría nueva que lo justifique (p. ej. violeta = identidad de usuario,
coral = social). No los metas por decorar.

## 7. Reglas de aplicación
1. **Un acento por zona.** Una sección no mezcla dos semánticos. El estante "En lectura" es
   menta de principio a fin.
2. **Tinte, no bloque.** Los fondos de color van por `color-mix` al 7–15% sobre papel. El
   color pleno solo en marcas pequeñas (cuadraditos, lomos, texto de contador, iconos).
3. **El teal es la marca, no un estado.** El teal queda reservado a acciones/identidad; por
   eso "leído" usa violeta y no teal (evita que el estado compita con los botones de acción).
4. **Contraste primero.** Cualquier texto de color sobre papel ≥ AA (4.5:1). Los acentos
   menta/ámbar/teal a `55% L` cumplen sobre crema.
5. **Restricción.** Si dudas, menos color. El papel y la tipografía llevan el peso; el color
   solo orienta.

## 8. Dónde vive
`:root` en `src/styles/global.css` (tokens). Aplicaciones: `.shelf-*` (estantes),
`.activity-ticker*` (actividad = `--live`), `.brand-copy::before` (lomo teal del header),
`.book-card-*`, `.chapter-node.is-done` (verde progreso). Extiende SIEMPRE por token nuevo
semántico, nunca con un hex suelto en un componente.

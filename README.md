# Nubera

Plataforma web de automatización y gestión para radios FM/AM y digitales. Un único panel controla la transmisión por antena y el streaming, manteniendo ambos sincronizados.

> Estado: en desarrollo temprano.

## Arquitectura

- **Panel y API en la nube**: programación, biblioteca multimedia, publicidad, métricas e interacción con oyentes.
- **Agente de estudio**: servicio instalado en el estudio que reproduce la programación (motor Liquidsoap) hacia el transmisor y sigue al aire aunque se corte internet.
- **Streaming**: Icecast / HLS para el player web y apps.
- **Capa de IA opcional**: proveedores intercambiables (plantillas, Piper, Whisper, modelos locales o APIs). Ninguna función del núcleo depende de IA.

## Estructura

```
apps/
  api/          API HTTP (Fastify + TypeScript)
  web/          Panel web (Next.js, React, Tailwind CSS)
packages/
  ai/           Interfaces de proveedores de IA e implementaciones
  core/         Motor de rotación, grilla horaria y tandas publicitarias (lógica pura)
  db/           Esquema (Drizzle ORM), migraciones y datos de demostración
infra/
  docker/       Entorno de desarrollo (Docker Compose, Icecast)
  liquidsoap/   Script del motor de audio
```

Se agregarán `agent` y `listener` a medida que avance el desarrollo.

## Requisitos

- Node.js >= 22 y pnpm 9
- Docker y Docker Compose (servicios de desarrollo)

## Desarrollo

```bash
pnpm install
pnpm typecheck
pnpm test

# servicios de apoyo (PostgreSQL, Redis)
cp .env.example .env   # completar valores
docker compose --env-file .env -f infra/docker/compose.dev.yml up -d
```

## Panel web

Aplicación Next.js (App Router) con Tailwind CSS y componentes accesibles basados en Radix. Tema oscuro y claro, español rioplatense y diseño adaptable a celular.

| Pantalla | Qué muestra |
|---|---|
| **Aire** | Qué suena ahora con cronómetro, qué viene, lo último emitido, estado del motor de audio y bloque vigente. Se actualiza cada 3 segundos. |
| **Programación** | Grilla semanal con los bloques apilados según cuál manda, línea de la hora actual, cobertura de la semana y franjas sin programar. Se crean y editan bloques (días, horario, mezcla de categorías, intercalados, tandas y separaciones) con un resumen de las reglas. Los bloques se arrastran para cambiarlos de horario y se estiran desde los bordes (también con Alt + flechas, y Esc cancela); los que quedan tapados por otro muestran su nombre en una solapa lateral. En el celular se ve como agenda por día. |
| **Biblioteca** | Búsqueda, filtro por categoría, escucha en el navegador, subida de varios archivos con progreso, edición y borrado. |
| **Publicidad** | Campañas con su vigencia, estado y avance (se pausan con un interruptor), anunciantes con su rubro y el certificado de emisión de cada uno: totales, gráfico por día, detalle con hora local, descarga en CSV y PDF para imprimir. Desde ahí se puede **compartir un enlace** (con botón de WhatsApp) para que el anunciante vea e imprima su certificado sin tener cuenta: el enlace vence, se puede revocar y nunca muestra datos internos (`/certificado/<token>`). |
| **Ajustes** | Mi cuenta (datos y cambio de contraseña) para todos; para el dueño además el equipo (alta con contraseña generada, roles, desactivar, restablecer contraseña), los datos de la emisora y la zona horaria, y los tokens del motor de audio (se muestran una sola vez, con estado de conexión) y la dirección y el código del reproductor público. |
| **Historial** | Lo que salió al aire en el día, ayer, 7 o 30 días, con totales por categoría. |

Cada usuario ve solo lo que su rol permite (la API es la que decide; el panel oculta las acciones que no corresponden).

```bash
# En contenedor (recomendado): API + panel en http://127.0.0.1:3001
docker compose --env-file .env -f infra/docker/compose.dev.yml up -d --build web

# Con Node, para desarrollar el panel (la API debe estar en API_URL)
API_URL=http://127.0.0.1:53000 pnpm --filter @nubera/web dev   # http://127.0.0.1:3001
```

- El navegador solo habla con el panel: las llamadas a `/api/*` se reenvían a la API (`API_URL`, interna). No hace falta CORS y la cookie de sesión es de mismo origen.
- Detrás de un proxy propio (Caddy, Cloudflare) definir `NUBERA_TRUST_FORWARDED=true` en el panel y `TRUST_PROXY=true` en la API, para que el límite de intentos de login use la IP real del cliente.
- Para verlo desde otra máquina sin exponer el puerto: `ssh -L 3001:127.0.0.1:3001 <servidor>`.

## Streaming de desarrollo

Icecast recibe la emisión de Liquidsoap en el montaje llamado live. Ambos corren en contenedores aislados y Icecast solo escucha en loopback.

```bash
mkdir -p data/media/music   # copiar aquí audios (carpeta ignorada por git)
docker compose --env-file .env -f infra/docker/compose.dev.yml up -d --build icecast liquidsoap
```

- Stream: `http://127.0.0.1:58000/live` (puerto configurable con `NUBERA_ICECAST_PORT`).
- Si no hay audios en la biblioteca, emite un tono para que el aire nunca quede mudo.
- Definir las contraseñas `ICECAST_*` en `.env`; los valores de `.env.example` son ficticios.

## Base de datos y biblioteca de audios

```bash
# con los servicios de apoyo levantados y DATABASE_URL definida
pnpm --filter @nubera/db db:migrate   # aplica las migraciones
pnpm --filter @nubera/db db:seed      # crea una emisora de demostración
pnpm --filter @nubera/api start       # API en http://127.0.0.1:3000
```

Si se cambia el esquema (`packages/db/src/schema.ts`), generar la migración con `pnpm --filter @nubera/db db:generate`.

| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/health` | público | Estado del servicio |
| POST | `/auth/login` | público | Inicia sesión (cookie `nubera_session`) |
| POST | `/auth/logout` | sesión | Cierra la sesión |
| GET | `/auth/me` | sesión | Usuario actual |
| POST | `/auth/password` | sesión | Cambia la contraseña y cierra las demás sesiones |
| GET, POST | `/users` | `users:manage` | Lista y crea usuarios del propio cliente |
| PATCH | `/users/:userId` | `users:manage` | Cambia nombre, rol o estado; al desactivar se cierran sus sesiones. No se puede uno mismo cambiar el rol ni desactivarse |
| POST | `/users/:userId/password` | `users:manage` | Restablece la contraseña de otra persona y cierra sus sesiones |
| GET | `/stations` | sesión | Emisoras del cliente |
| PATCH | `/stations/:stationId` | `stations:manage` | Edita nombre y zona horaria |
| GET | `/playout/plays/:playId/audio` | token de agente | El motor del estudio descarga el audio de una emisión de su emisora |
| GET | `/public/stations/:slug` | pública | Datos de la emisora para su página pública: nombre, flujo, qué suena y lo último que sonó (sin avisos ni datos internos) |
| GET | `/stations/:stationId/on-air` | `plays:read` | Estado del aire: suena ahora, lo que viene, lo anterior y el motor |
| GET | `/stations/:stationId/assets` | `assets:read` | Lista audios (`q`, `category`, `limit`, `offset`; devuelve `total`) |
| GET | `/stations/:stationId/assets/:assetId` | `assets:read` | Detalle de un audio |
| GET | `/stations/:stationId/assets/:assetId/audio` | `assets:read` | Escucha el archivo (admite `Range`) |
| POST | `/stations/:stationId/assets` | `assets:write` | Sube un audio (`multipart/form-data`) |
| PATCH, DELETE | `/stations/:stationId/assets/:assetId` | `assets:write` | Edita título, artista y categoría; borra el audio |
| GET | `/stations/:stationId/schedule` | `schedule:read` | Bloques de la grilla semanal |
| POST, PUT, DELETE | `/stations/:stationId/schedule[/:blockId]` | `schedule:write` | Crea, edita y borra bloques |
| GET | `/stations/:stationId/schedule/now` | `schedule:read` | Bloque vigente (`at` opcional) |
| GET | `/stations/:stationId/plays` | `plays:read` | Historial de lo emitido (`from`, `to`, `limit`) |
| GET, POST, DELETE | `/stations/:stationId/agent-tokens[/:tokenId]` | `agents:manage` | Tokens del motor de audio |
| GET | `/playout/next` | token de agente | Próximo audio a emitir (204 si no hay) |
| POST | `/playout/plays/:playId/started` | token de agente | Confirma que el audio empezó a sonar |
| GET | `/advertisers[/:advertiserId]` | `ads:read` | Lista y detalle de anunciantes |
| POST, PUT, DELETE | `/advertisers[/:advertiserId]` | `ads:write` | Alta, edición y baja de anunciantes |
| GET | `/stations/:stationId/campaigns[/:campaignId]` | `ads:read` | Campañas (`advertiserId`, `active`) |
| POST, PUT, DELETE | `/stations/:stationId/campaigns[/:campaignId]` | `ads:write` | Alta, edición y baja de campañas |
| GET | `/advertisers/:advertiserId/report` | `ads:read` | Certificado de emisión (`from`, `to`, `stationId`, `format=json\|csv`) |
| POST, GET | `/advertisers/:advertiserId/certificate-links` | `ads:write`, `ads:read` | Crea (y lista) enlaces públicos al certificado de un anunciante: fijan emisora y período, vencen (1 a 90 días) y el token se muestra solo al crearlo |
| DELETE | `/certificate-links/:linkId` | `ads:write` | Revoca un enlace: deja de abrirse de inmediato |
| GET | `/public/certificates/:token` | enlace | Certificado de emisión de un enlace vigente (`?format=csv` para el detalle); vencido, revocado o inexistente responde 404 |

En la subida, los campos `title`, `artist` y `category` deben enviarse antes del archivo. Formatos: mp3, wav, flac, ogg, m4a y aac. Los archivos se guardan por contenido (SHA-256), por lo que un mismo audio no se duplica.

## Programación y motor de audio

La grilla semanal se compone de **bloques**: días, horario local de la emisora y reglas de rotación. Si dos bloques se superponen, gana el que empieza más tarde (y si empiezan a la vez, el más corto). Un bloque no cruza la medianoche; para eso se usan dos.

```json
{
  "name": "Mañana",
  "days": [1, 2, 3, 4, 5],
  "start": "06:00",
  "end": "12:00",
  "rotation": {
    "pool": [{ "category": "music", "weight": 4 }, { "category": "institutional", "weight": 1 }],
    "insertions": [{ "category": "jingle", "everyTracks": 4 }],
    "artistSeparation": 3,
    "trackSeparationMinutes": 120
  }
}
```

- `pool`: categorías de las que se elige, ponderadas por `weight`.
- `insertions`: cada N emisiones se intercala una categoría (p. ej. un jingle).
- `artistSeparation` y `trackSeparationMinutes`: evitan repetir artista o tema. Si no hay alternativa, se aflojan en lugar de dejar el aire sin música.

El motor (`packages/core`) es una función pura y está cubierto por tests. Liquidsoap pide cada audio a `GET /playout/next` con un **token de agente** (credencial propia de la emisora, revocable, que se muestra una sola vez) y confirma cada emisión; eso alimenta el historial. Si la API no responde, sigue al aire con la biblioteca local de emergencia (`data/media/music`) y, en última instancia, con un tono.

```bash
# 1. levantar todo (la API aplica las migraciones al iniciar)
docker compose --env-file .env -f infra/docker/compose.dev.yml up -d --build

# 2. crear un token de agente (POST /stations/:id/agent-tokens, como dueño)
#    y guardarlo en .env como NUBERA_AGENT_TOKEN; luego:
docker compose --env-file .env -f infra/docker/compose.dev.yml up -d liquidsoap
```

## Reproductor público

Cada emisora tiene una página para que los oyentes la escuchen en vivo, sin cuenta ni instalación:

| Dirección | Qué es |
|---|---|
| `/radio/<slug>` | Página completa: reproductor, qué suena, lo que sonó antes y volumen. Se puede indexar. |
| `/embed/<slug>` | Versión compacta para pegar en el sitio de la radio con un `iframe`. |

El código para incrustar y la dirección para compartir están en **Ajustes → Emisora**. El reproductor reconecta solo si se corta el flujo y muestra los controles en la pantalla de bloqueo del celular.

La dirección del flujo de audio se define con `NUBERA_PUBLIC_STREAM_URL` (ver `.env.example`); sin ella la página se muestra pero no reproduce. El `slug` de la emisora es único en toda la plataforma porque forma parte de la dirección pública. Para que el público lo use desde internet hace falta HTTPS delante del panel y del flujo: los navegadores bloquean audio sin cifrar dentro de páginas seguras.

## Instalación en el estudio

Hardware, conexión a la antena y al streaming, y puesta en marcha del motor de audio: [docs/instalacion-estudio.md](docs/instalacion-estudio.md).

El motor del estudio (`infra/studio`) descarga la programación de la API con su token, guarda los audios en un caché local y emite por la placa de sonido (`NUBERA_ALSA_DEVICE`) y, opcionalmente, a Icecast. Se instala con `infra/studio/install.sh`. El mismo script (`infra/liquidsoap/radio.liq`) sirve en desarrollo, leyendo los audios de una carpeta compartida.

## Publicidad

Un **anunciante** (con su rubro) tiene **campañas** en una emisora: vigencia (fechas locales, inclusivas), días y franja horaria, un tope de emisiones por día, un peso relativo y los avisos que rota (audios de categoría `ad`). Las tandas se activan por bloque de la grilla:

```json
"rotation": {
  "pool": [{ "category": "music", "weight": 1 }],
  "ads": { "everyTracks": 4, "spotsPerBreak": 2 }
}
```

Cada `everyTracks` emisiones se emite una tanda de hasta `spotsPerBreak` avisos. Para elegirlos:

- Solo cuentan campañas activas, vigentes ahora y que no llegaron a su tope diario.
- **Exclusividad:** dentro de una tanda no se repite el anunciante ni el rubro. Si por eso no queda ninguna campaña, la tanda termina antes en lugar de romper la regla.
- Gana la campaña con menos emisiones hoy en proporción a su peso, y dentro de ella el aviso que hace más tiempo no suena.
- Si no hay campañas elegibles, el aire sigue con música.
- La categoría `ad` no debe incluirse en el `pool` del bloque.

`GET /advertisers/:id/report` devuelve el **certificado de emisión**: cada aviso que efectivamente salió al aire (confirmado por el motor), con su hora local, y los totales por día y por campaña. Con `format=csv` se descarga para abrir en una planilla.

## Autenticación y permisos

- Sesiones en base de datos con cookie `HttpOnly` y `SameSite=Lax` (`Secure` con `NODE_ENV=production`). Solo se guarda el hash del token. Duración: 7 días.
- Contraseñas con scrypt, mínimo 12 caracteres. El login tiene límite de intentos por IP (5 por minuto) y no revela si el email existe.
- Cada usuario pertenece a un cliente y solo ve los datos del suyo; lo ajeno se informa como inexistente (404).
- Roles: `owner` (todo), `programmer` (biblioteca y grilla, lectura y escritura), `announcer` (biblioteca y grilla, lectura) y `sales` (anunciantes y campañas, lectura y escritura, e historial de emisiones). El programador puede ver la publicidad pero no modificarla.
- Detrás de un proxy propio, definir `TRUST_PROXY=true` para que el límite de intentos use la IP real.

Alta del primer dueño de un cliente (la contraseña se pasa por variable de entorno, no por argumento):

```bash
NUBERA_USER_PASSWORD='...' pnpm --filter @nubera/api create-user \
  --tenant demo --email dueno@radio.com --name "Nombre" --role owner
```

> Antes de exponer la API fuera de loopback hace falta HTTPS y revisar el modelo de amenazas (CSRF, CORS y cabeceras de seguridad).

## Licencia

Software propietario, todos los derechos reservados. El código es visible solo para consulta; no se permite su uso, copia, modificación ni distribución sin autorización escrita. Ver [LICENSE](LICENSE).

## Flujo de trabajo

- `main` está protegida: los cambios entran por Pull Request.
- Ramas: `feat/...`, `fix/...`, `chore/...`, `docs/...`.
- Commits siguiendo [Conventional Commits](https://www.conventionalcommits.org/).
- No se versionan secretos: usar `.env` (ignorado) basado en `.env.example`.

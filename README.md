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
packages/
  ai/           Interfaces de proveedores de IA e implementaciones
  core/         Motor de rotación, grilla horaria y tandas publicitarias (lógica pura)
  db/           Esquema (Drizzle ORM), migraciones y datos de demostración
infra/
  docker/       Entorno de desarrollo (Docker Compose, Icecast)
  liquidsoap/   Script del motor de audio
```

Se agregarán `web`, `agent`, `listener`, `db` y `core` a medida que avance el desarrollo.

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
| GET | `/stations/:stationId/assets` | `assets:read` | Lista audios (`category`, `limit`, `offset`) |
| GET | `/stations/:stationId/assets/:assetId` | `assets:read` | Detalle de un audio |
| POST | `/stations/:stationId/assets` | `assets:write` | Sube un audio (`multipart/form-data`) |
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

En la subida, los campos `title`, `artist` y `category` deben enviarse antes del archivo. Formatos: mp3, wav, flac, ogg, m4a y aac. Los archivos se guardan por contenido (SHA-256), por lo que un mismo audio no se duplica.

## Programación y motor de audio

La grilla semanal se compone de **bloques**: días, horario local de la emisora y reglas de rotación. Si dos bloques se superponen, gana el que empieza más tarde. Un bloque no cruza la medianoche; para eso se usan dos.

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

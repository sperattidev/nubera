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

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio |
| GET | `/stations/:stationId/assets` | Lista audios (`category`, `limit`, `offset`) |
| GET | `/stations/:stationId/assets/:assetId` | Detalle de un audio |
| POST | `/stations/:stationId/assets` | Sube un audio (`multipart/form-data`) |

En la subida, los campos `title`, `artist` y `category` deben enviarse antes del archivo. Formatos: mp3, wav, flac, ogg, m4a y aac. Los archivos se guardan por contenido (SHA-256), por lo que un mismo audio no se duplica.

> La API todavía **no tiene autenticación**: solo debe escuchar en loopback y no exponerse a internet hasta que se incorpore.

## Licencia

Software propietario, todos los derechos reservados. El código es visible solo para consulta; no se permite su uso, copia, modificación ni distribución sin autorización escrita. Ver [LICENSE](LICENSE).

## Flujo de trabajo

- `main` está protegida: los cambios entran por Pull Request.
- Ramas: `feat/...`, `fix/...`, `chore/...`, `docs/...`.
- Commits siguiendo [Conventional Commits](https://www.conventionalcommits.org/).
- No se versionan secretos: usar `.env` (ignorado) basado en `.env.example`.

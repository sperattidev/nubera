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
infra/
  docker/       Entorno de desarrollo (Docker Compose)
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

## Licencia

Software propietario, todos los derechos reservados. El código es visible solo para consulta; no se permite su uso, copia, modificación ni distribución sin autorización escrita. Ver [LICENSE](LICENSE).

## Flujo de trabajo

- `main` está protegida: los cambios entran por Pull Request.
- Ramas: `feat/...`, `fix/...`, `chore/...`, `docs/...`.
- Commits siguiendo [Conventional Commits](https://www.conventionalcommits.org/).
- No se versionan secretos: usar `.env` (ignorado) basado en `.env.example`.

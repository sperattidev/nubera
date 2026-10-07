#!/usr/bin/env bash
# Instala el motor de audio de Nubera en la PC del estudio.
#
#   ./install.sh                 pregunta lo que falta y arranca el motor
#   ./install.sh --sin-iniciar   solo deja listo el .env y las carpetas
#
# Para no responder preguntas se pueden definir antes NUBERA_API_URL, NUBERA_AGENT_TOKEN y
# NUBERA_ALSA_DEVICE. El token nunca se muestra en pantalla ni queda en el historial.
set -euo pipefail

cd "$(dirname "$0")"
START=1
[ "${1:-}" = "--sin-iniciar" ] && START=0

fail() { echo "Error: $*" >&2; exit 1; }

command -v docker >/dev/null || fail "Docker no está instalado. Seguí https://docs.docker.com/engine/install/ y volvé a ejecutar este script."
docker compose version >/dev/null 2>&1 || fail "Falta el plugin 'docker compose'. Ver https://docs.docker.com/compose/install/linux/"

if [ -f .env ]; then
  echo "Ya existe un .env: no se toca. Para volver a configurar, borralo y ejecutá otra vez."
else
  if [ -z "${NUBERA_API_URL:-}" ]; then
    read -r -p "Dirección de la API de Nubera (por ejemplo https://tu-dominio/api): " NUBERA_API_URL
  fi
  case "$NUBERA_API_URL" in
    https://*|http://*) ;;
    *) fail "La dirección debe empezar con https:// (o http:// dentro de una red interna)" ;;
  esac

  if [ -z "${NUBERA_AGENT_TOKEN:-}" ]; then
    read -r -s -p "Token del motor (Ajustes → Motor de audio en el panel; no se muestra): " NUBERA_AGENT_TOKEN
    echo
  fi
  case "$NUBERA_AGENT_TOKEN" in
    nbr_*) ;;
    *) fail "Ese no parece un token de Nubera (empieza con nbr_). Copialo de nuevo desde el panel." ;;
  esac

  if [ -z "${NUBERA_ALSA_DEVICE:-}" ]; then
    echo
    echo "Placas de sonido de esta PC:"
    aplay -l 2>/dev/null || echo "  (no se pudo listar; si falta, instalá alsa-utils)"
    read -r -p "Dispositivo de salida [default]: " NUBERA_ALSA_DEVICE
    NUBERA_ALSA_DEVICE="${NUBERA_ALSA_DEVICE:-default}"
  fi

  AUDIO_GID="$(getent group audio | cut -d: -f3 || true)"

  # El .env lo lee solo este usuario; el umask restringido vale solo para este archivo.
  (
    umask 077
    {
      echo "NUBERA_API_URL=$NUBERA_API_URL"
      echo "NUBERA_AGENT_TOKEN=$NUBERA_AGENT_TOKEN"
      echo "NUBERA_ALSA_DEVICE=$NUBERA_ALSA_DEVICE"
      echo "AUDIO_GID=${AUDIO_GID:-29}"
    } > .env
  )
  echo ".env creado (solo lo lee tu usuario)."
fi

mkdir -p emergencia
# El motor corre con otro usuario dentro del contenedor: la carpeta tiene que poder leerse.
chmod 755 emergencia
if [ -z "$(ls -A emergencia 2>/dev/null)" ]; then
  echo
  echo "Atención: la carpeta 'emergencia' está vacía. Copiá ahí música (MP3) para que la radio"
  echo "no quede en silencio si se corta internet o no hay nada programado."
fi

if [ "$START" -eq 1 ]; then
  docker compose --env-file .env up -d
  echo
  echo "Motor iniciado. En unos segundos el panel lo muestra como Conectado (Ajustes → Motor de audio)."
  echo "Ver lo que hace:  docker compose logs -f"
else
  echo "Listo. Para iniciar:  docker compose --env-file .env up -d"
fi

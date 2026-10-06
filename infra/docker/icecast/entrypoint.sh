#!/bin/sh
# Genera la configuración a partir de variables de entorno (sin secretos en la imagen).
set -eu

: "${ICECAST_SOURCE_PASSWORD:?definir ICECAST_SOURCE_PASSWORD}"
: "${ICECAST_RELAY_PASSWORD:?definir ICECAST_RELAY_PASSWORD}"
: "${ICECAST_ADMIN_PASSWORD:?definir ICECAST_ADMIN_PASSWORD}"

envsubst '${ICECAST_SOURCE_PASSWORD} ${ICECAST_RELAY_PASSWORD} ${ICECAST_ADMIN_PASSWORD}' \
  < /etc/icecast/icecast.xml.tmpl > /tmp/icecast.xml

exec icecast -c /tmp/icecast.xml

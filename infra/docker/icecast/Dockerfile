FROM alpine:3.21

RUN apk add --no-cache icecast gettext

COPY icecast.xml.tmpl /etc/icecast/icecast.xml.tmpl
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Corre sin privilegios (usuario creado por el paquete icecast).
USER icecast
EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]

# Guía de instalación en el estudio

Cómo dejar una radio funcionando con Nubera: qué hardware hace falta, cómo se conecta a la antena y al streaming, y cómo se instala el motor de audio.

> **Estado.** El motor del estudio ya descarga la programación, guarda los audios en un caché local y emite por la placa de sonido. Está probado de punta a punta contra el servidor, pero **todavía no con una placa de sonido y una consola reales**. Lo que falta se indica al final, en [Qué falta construir](#qué-falta-construir).

## 1. Cómo se reparte el sistema

```
        NUBE (servidor propio o VPS)                         ESTUDIO
┌──────────────────────────────────────┐        ┌─────────────────────────────────┐
│ Panel web + API + base de datos      │◄───────│ Motor de audio (Liquidsoap)     │
│ Icecast (streaming público, HTTPS)   │◄─audio─│  ├─ salida 1: placa de sonido ──┼─► consola ─► transmisor ─► antena
└──────────────────────────────────────┘        │  └─ salida 2: Icecast (nube)    │
        ▲                                       └─────────────────────────────────┘
        │ oyentes por internet
```

- **Antena (FM/AM):** el audio sale por la placa de sonido de la PC del estudio hacia la consola o el procesador de audio de la radio. Para el transmisor, Nubera es una fuente más, como un reproductor o un micrófono.
- **Internet:** el mismo motor puede mandar un único flujo a Icecast, que está en la nube. Así la conexión de subida del estudio solo lleva un flujo (unos 128 kbps) y no importa cuántos oyentes haya. El enlace seguro entre el estudio y Icecast todavía no está resuelto (ver al final).
- **Si se corta internet:** la programación se detiene, porque la decide la nube. La antena sigue sonando con la **música de emergencia** guardada en el estudio, y el motor retoma la programación solo cuando vuelve la conexión. Los audios ya descargados no se vuelven a bajar.

## 2. Hardware mínimo

| Qué | Recomendado | Notas |
|---|---|---|
| PC del estudio | Mini PC con 4 núcleos, 8 GB de RAM y SSD de 256 GB o más | Debe quedar encendida 24/7. Sin pantalla, se administra por red. |
| Placa de sonido | Interfaz USB con salidas balanceadas (TRS o XLR) | Evitar la salida de audio de la placa madre: mete ruido y zumbido. |
| Cable | TRS o XLR balanceado hasta una entrada de línea de la consola | Cuanto más corto, mejor. Nunca a la entrada de micrófono. |
| Energía | UPS de al menos 600 VA | Evita reinicios por cortes breves y protege el disco. |
| Red | Cable Ethernet, subida de 1 Mbps o más | Wi-Fi solo como último recurso. |
| Almacenamiento | Espacio para la biblioteca musical | 1000 temas de 4 minutos en MP3 128 kbps ocupan unos 4 GB. |

## 3. Cableado de audio

1. Conectar la salida de línea de la interfaz USB a una entrada de línea libre de la consola (o al procesador de audio, si hay uno antes del transmisor).
2. Con el canal de Nubera bajo en la consola, subir el nivel de a poco y ajustarlo para que los picos lleguen cerca de 0 dB en el vúmetro, sin pasar a rojo.
3. Si hay locutores en vivo, el micrófono se mezcla en la consola como siempre. Nubera no mezcla voces en vivo: se baja su canal en la consola cuando habla el locutor.

## 4. Instalar el motor

1. Instalar Ubuntu Server 24.04 LTS en la PC del estudio, con actualizaciones automáticas de seguridad, y `alsa-utils` (`sudo apt install alsa-utils`).
2. Instalar Docker siguiendo la [guía oficial](https://docs.docker.com/engine/install/ubuntu/) y dar acceso al usuario (`sudo usermod -aG docker $USER`, y volver a iniciar sesión).
3. Traer el código y ejecutar el instalador guiado:

```bash
git clone https://github.com/sperattidev/nubera.git
cd nubera/infra/studio
./install.sh
```

El instalador pide la dirección de la API, el token del motor (sin mostrarlo) y la placa de sonido, escribe el `.env` (solo legible por tu usuario), crea la carpeta `emergencia` y arranca el motor. Para elegir la placa, `aplay -l` las lista; conviene el formato `plughw:1,0` (tarjeta 1, dispositivo 0), que convierte el formato de audio si hace falta.

4. **Copiar música de emergencia** (MP3) a `infra/studio/emergencia`: suena si se corta internet o no hay nada programado. Sin ella, la radio queda con un tono.
5. El motor se reinicia solo si falla y arranca con el equipo (`restart: unless-stopped`). Ver lo que hace: `docker compose logs -f`.

## 5. Conectar el estudio con el panel

1. En el panel, entrar a **Ajustes → Motor de audio** y crear un token con un nombre que identifique al estudio.
2. Copiar la línea `NUBERA_AGENT_TOKEN=…`: se muestra una sola vez.
3. Pegar el token cuando lo pide `./install.sh` (o, a mano, guardarlo en el `.env` de la PC del estudio). Ese archivo no se comparte ni se sube a ningún repositorio.
4. En unos segundos el panel muestra el estado **Conectado**.
5. Si un token se filtra o la PC se reemplaza, revocarlo desde el panel y crear otro.

## 6. Dónde escuchan los oyentes en digital

El streaming sale de Icecast como un flujo MP3 de 128 kbps. Quien tenga la dirección puede escucharlo en:

- **Navegador**, con un reproductor incrustado en el sitio de la radio.
- **Apps y reproductores** como VLC, o cualquier app de radio que acepte una dirección de streaming.
- **Directorios de radios** (por ejemplo TuneIn, Radio Garden o directorios regionales), que se dan de alta con la dirección del streaming.
- **Parlantes inteligentes y autos**, vía esos mismos directorios.

Requisitos para publicarlo:

- La dirección del streaming debe ser **HTTPS** y tener dominio propio: los navegadores bloquean audio sin cifrar dentro de páginas seguras. Ver *Publicación en internet* en el README.
- Nubera ya incluye el reproductor público (`/radio/<slug>`) y su versión incrustable; ver *Reproductor público* en el README.
- Ancho de banda del servidor: cada oyente consume 128 kbps. Cien oyentes simultáneos son unos 13 Mbps de salida.

## 7. Verificación antes de dar por terminada la instalación

- [ ] El panel muestra el motor **Conectado** en Ajustes.
- [ ] En **Aire** suena el audio programado y avanza la lista de lo que viene.
- [ ] La consola recibe señal de la PC y el nivel es correcto.
- [ ] La radio se escucha en un receptor de FM real, no solo en la consola.
- [ ] El streaming se escucha desde un celular con datos móviles.
- [ ] Se desconecta el cable de red unos minutos: la antena sigue sonando con la música de emergencia y, al volver la red, retoma la programación.
- [ ] Se corta y se vuelve a dar energía a la PC: arranca sola y vuelve a **Conectado**.

## Qué falta construir

| Pendiente | Por qué hace falta |
|---|---|
| Probar con una placa de sonido y una consola reales | Se probó contra el servidor con un dispositivo de audio nulo. Falta confirmar el nivel, el ruido y el arranque con una placa de verdad. |
| Enlace seguro del streaming desde el estudio a la nube | El motor puede mandar su flujo a Icecast, pero la conexión de origen todavía no se expone de forma segura por internet. Hace falta decidirlo (por ejemplo una VPN o un túnel hacia el servidor de streaming). |
| Instalar Docker desde el instalador | Hoy el instalador exige que Docker ya esté instalado. |
| Limpieza del caché por espacio en disco | Hoy se borra por antigüedad (`NUBERA_CACHE_DAYS`), no por tamaño. |

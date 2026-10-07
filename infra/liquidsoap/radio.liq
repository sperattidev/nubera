# Motor de audio: pide el próximo audio a la API, lo emite y confirma cada emisión.
# Si la API no responde, cae a la biblioteca local y, en última instancia, a un tono,
# para que el aire nunca quede mudo.
#
# Funciona en dos modos, según de dónde salgan los archivos:
#   - Servidor (desarrollo): lee los audios de una carpeta compartida con la API (NUBERA_STORAGE_DIR).
#   - Estudio: con NUBERA_CACHE_DIR los descarga de la API y los guarda en un caché local;
#     un audio ya descargado no se vuelve a bajar. Si se corta internet, la programación se
#     detiene (la decide la API) y suena la biblioteca de emergencia local (/media/music).
# Durante un programa en vivo (un bloque de ese tipo en la grilla) la automatización se pausa: la antena
# queda en silencio, porque el locutor y la consola se hacen cargo, y el streaming toma la entrada de la
# consola si hay una (NUBERA_LIVE_INPUT_DEVICE).
# Y emite a una o a las dos salidas: la placa de sonido que alimenta la consola y el transmisor
# (NUBERA_ALSA_DEVICE) y/o un servidor Icecast para el streaming (ICECAST_HOST).

settings.log.stdout := true
settings.log.file := false

# --- Configuración ---

api_url = environment.get(default="", "NUBERA_API_URL")
agent_token = environment.get(default="", "NUBERA_AGENT_TOKEN")
api_enabled = api_url != "" and agent_token != ""
auth_headers = [("Authorization", "Bearer #{agent_token}")]
json_headers = [("Authorization", "Bearer #{agent_token}"), ("Content-Type", "application/json")]

storage_dir = environment.get(default="/storage", "NUBERA_STORAGE_DIR")
cache_dir = environment.get(default="", "NUBERA_CACHE_DIR")
cache_days = float_of_string(environment.get(default="30", "NUBERA_CACHE_DAYS"))
remote = cache_dir != ""

alsa_device = environment.get(default="", "NUBERA_ALSA_DEVICE")
icecast_host = environment.get(default="icecast", "ICECAST_HOST")
icecast_port = int_of_string(environment.get(default="8000", "ICECAST_PORT"))
icecast_mount = environment.get(default="/live", "ICECAST_MOUNT")
icecast_password = environment.get(default="", "ICECAST_SOURCE_PASSWORD")
icecast_name = environment.get(default="Nubera (desarrollo)", "ICECAST_NAME")

# Los valores van entre comillas dentro del URI "annotate:"; se reemplazan las comillas.
def clean(text) =
  string.replace(pattern='"', fun (_) -> "'", text)
end

# --- Caché de audios del estudio ---

if remote then
  file.mkdir(parents=true, cache_dir)
end

# Archivo del caché para una clave de almacenamiento ("ab/abc….mp3" -> "ab_abc….mp3").
def cache_path(key) =
  flat = string.replace(pattern="/", fun (_) -> "_", key)
  "#{cache_dir}/#{flat}"
end

# Protocolo "nubera:<emisión>@<clave>": devuelve el archivo local, descargándolo si todavía no está.
# La escritura es atómica, así que un corte a mitad de la descarga no deja un archivo roto.
def fetch_audio(~rlog, ~maxtime, arg) =
  ignore(maxtime)
  parts = string.split(separator="@", arg)
  play_id = list.nth(default="", parts, 0)
  key = list.nth(default="", parts, 1)
  if play_id == "" or key == "" or string.contains(substring="..", key) then
    rlog("Referencia de audio inválida: #{arg}")
    null
  else
    local = cache_path(key)
    if file.exists(local) then
      local
    else
      try
        response = http.get(headers=auth_headers, timeout=120., "#{api_url}/playout/plays/#{play_id}/audio")
        if response.status_code == 200 then
          file.write(atomic=true, temp_dir=cache_dir, data=response, local)
          rlog("Audio descargado al caché: #{key}")
          local
        else
          rlog("La API no entregó el audio de #{play_id} (HTTP #{response.status_code})")
          null
        end
      catch err do
        rlog("No se pudo descargar el audio de #{play_id}: #{error.message(err)}")
        null
      end
    end
  end
end

protocol.add(
  doc="Descarga un audio de Nubera al caché local.",
  syntax="nubera:<emisión>@<clave de almacenamiento>",
  "nubera",
  fetch_audio
)

# Borra del caché lo que no se usó en `cache_days` días. Si hace falta de nuevo, se vuelve a descargar.
def clean_cache() =
  oldest = time() - cache_days * 86400.
  list.iter(
    fun (name) -> begin
      entry = "#{cache_dir}/#{name}"
      if file.mtime(entry) < oldest then
        file.remove(entry)
        log.important("Caché: se borró #{name}")
      end
    end,
    file.ls(cache_dir)
  )
end

if remote then
  thread.run(fast=false, every=3600., delay=300., clean_cache)
end

# --- Cola de reproducción ---

# Dónde está el archivo: en el caché del estudio (se descarga al hacer falta) o en la carpeta compartida.
def audio_uri(info) =
  if remote then
    "nubera:#{info.playId}@#{info.storageKey}"
  else
    "#{storage_dir}/#{info.storageKey}"
  end
end

# Pregunta a la API qué audio sigue. Devuelve null si no hay nada programado o hay un error.
def next_track() =
  try
    response = http.get(headers=auth_headers, timeout=5., "#{api_url}/playout/next")
    if response.status_code == 200 then
      let json.parse (info : {playId: string, storageKey: string, title: string, artist: string}) = response
      uri = "annotate:play_id=\"#{info.playId}\",title=\"#{clean(info.title)}\",artist=\"#{clean(info.artist)}\":#{audio_uri(info)}"
      log.important("Próximo: #{info.artist} - #{info.title}")
      request.create(uri)
    else
      log.important("La API no tiene un próximo audio (HTTP #{response.status_code})")
      null
    end
  catch err do
    log.severe("No se pudo consultar la API: #{error.message(err)}")
    null
  end
end

# Avisa a la API que el audio empezó a sonar (sin bloquear el audio).
def report_started(m) =
  play_id = m["play_id"]
  if play_id != "" then
    thread.run(fast=false, fun () -> begin
      try
        response = http.post(headers=json_headers, data="{}", timeout=5., "#{api_url}/playout/plays/#{play_id}/started")
        if response.status_code != 204 then
          log.severe("La API rechazó la confirmación de #{play_id} (HTTP #{response.status_code})")
        end
      catch err do
        log.severe("No se pudo confirmar la emisión #{play_id}: #{error.message(err)}")
      end
    end)
  end
end

# Respaldo local: biblioteca de emergencia y, si no hay nada, un tono.
local_library = playlist(mode="randomize", reload_mode="watch", "/media/music")
fallback_audio = fallback(track_sensitive=false, [local_library, sine(440.)])

scheduled = request.dynamic(prefetch=1, retry_delay=3., next_track)
scheduled.on_track(synchronous=false, report_started)

# La programación manda: apenas hay un audio listo toma el aire, sin esperar a que termine el tema de respaldo
# (un tono, o un estudio sin biblioteca de emergencia, no tiene cortes de pista y nunca la cedería).
radio = if api_enabled then
  mksafe(fallback(track_sensitive=false, [scheduled, fallback_audio]))
else
  mksafe(fallback_audio)
end

# --- Programas en vivo ---

live_input_device = environment.get(default="", "NUBERA_LIVE_INPUT_DEVICE")
is_live = ref(false)

# Pregunta a la API si ahora hay un programa en vivo. También sirve de señal de vida del motor.
def check_mode() =
  try
    response = http.get(headers=auth_headers, timeout=5., "#{api_url}/playout/mode")
    if response.status_code == 200 then
      let json.parse (info : {mode: string, program: string?}) = response
      live_now = info.mode == "live"
      if live_now != is_live() then
        if live_now then
          log.important("Programa en vivo: la automatización se pausa")
        else
          log.important("Fin del programa en vivo: vuelve la automatización")
        end
      end
      is_live := live_now
    end
  catch err do
    log.severe("No se pudo consultar el modo: #{error.message(err)}")
  end
end

if api_enabled then
  thread.run(fast=false, every=5., check_mode)
end

# Retorno de la consola (entrada de línea de la PC): lo que sale al aire, con la voz del locutor.
live_input = if live_input_device != "" then mksafe(input.alsa(device=live_input_device)) else blank() end

antenna = switch(track_sensitive=false, [({is_live()}, blank()), ({true}, radio)])
stream = switch(track_sensitive=false, [({is_live()}, live_input), ({true}, radio)])

# --- Salidas ---

icecast_enabled = icecast_host != ""
alsa_enabled = alsa_device != ""

if alsa_enabled then
  log.important("Salida a la placa de sonido: #{alsa_device}")
  output.alsa(device=alsa_device, antenna)
end

if icecast_enabled then
  log.important("Streaming a Icecast: #{icecast_host}:#{icecast_port}#{icecast_mount}")
  output.icecast(
    %mp3(bitrate=128),
    host=icecast_host,
    port=icecast_port,
    password=icecast_password,
    mount=icecast_mount,
    name=icecast_name,
    stream
  )
end

if not alsa_enabled and not icecast_enabled then
  log.severe("No hay ninguna salida configurada (NUBERA_ALSA_DEVICE o ICECAST_HOST): el audio no va a ningún lado")
  output.dummy(radio)
end

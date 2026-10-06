# Motor de audio: pide el próximo audio a la API, lo emite a Icecast y confirma
# cada emisión. Si la API no responde, cae a la biblioteca local y, en última
# instancia, a un tono, para que el aire nunca quede mudo.

settings.log.stdout := true
settings.log.file := false

icecast_host = environment.get(default="icecast", "ICECAST_HOST")
icecast_port = int_of_string(environment.get(default="8000", "ICECAST_PORT"))
icecast_password = environment.get("ICECAST_SOURCE_PASSWORD")

api_url = environment.get(default="", "NUBERA_API_URL")
agent_token = environment.get(default="", "NUBERA_AGENT_TOKEN")
storage_dir = environment.get(default="/storage", "NUBERA_STORAGE_DIR")
auth_headers = [("Authorization", "Bearer #{agent_token}")]
json_headers = [("Authorization", "Bearer #{agent_token}"), ("Content-Type", "application/json")]
api_enabled = api_url != "" and agent_token != ""

# Los valores van entre comillas dentro del URI "annotate:"; se reemplazan las comillas.
def clean(text) =
  string.replace(pattern='"', fun (_) -> "'", text)
end

# Pregunta a la API qué audio sigue. Devuelve null si no hay nada programado o hay un error.
def next_track() =
  try
    response = http.get(headers=auth_headers, timeout=5., "#{api_url}/playout/next")
    if response.status_code == 200 then
      let json.parse (info : {playId: string, storageKey: string, title: string, artist: string}) = response
      uri = "annotate:play_id=\"#{info.playId}\",title=\"#{clean(info.title)}\",artist=\"#{clean(info.artist)}\":#{storage_dir}/#{info.storageKey}"
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

radio = if api_enabled then
  mksafe(fallback(track_sensitive=true, [scheduled, fallback_audio]))
else
  mksafe(fallback_audio)
end

output.icecast(
  %mp3(bitrate=128),
  host=icecast_host,
  port=icecast_port,
  password=icecast_password,
  mount="/live",
  name="Nubera (desarrollo)",
  radio
)

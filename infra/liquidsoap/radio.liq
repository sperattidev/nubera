# Motor de audio de desarrollo: reproduce la biblioteca y emite al streaming.
# Si no hay audios disponibles, cae a un tono para que el aire nunca quede mudo.

settings.log.stdout := true
settings.log.file := false

icecast_host = environment.get(default="icecast", "ICECAST_HOST")
icecast_port = int_of_string(environment.get(default="8000", "ICECAST_PORT"))
icecast_password = environment.get("ICECAST_SOURCE_PASSWORD")

music = playlist(mode="randomize", reload_mode="watch", "/media/music")

radio = mksafe(fallback(track_sensitive=false, [music, sine(440.)]))

output.icecast(
  %mp3(bitrate=128),
  host=icecast_host,
  port=icecast_port,
  password=icecast_password,
  mount="/live",
  name="Nubera (desarrollo)",
  radio
)

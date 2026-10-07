import { ApiError, goToLogin } from "./api";
import type { Asset } from "./types";
import type { AssetCategory } from "./categories";

export const AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac"] as const;
export const ACCEPT_ATTRIBUTE = AUDIO_EXTENSIONS.join(",");

/** Mismo máximo que la API por defecto (MAX_UPLOAD_MB). La API es la que decide. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** Motivo por el que un archivo no se puede subir, o null si es válido. */
export function fileProblem(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const extension = dot === -1 ? "" : file.name.slice(dot).toLowerCase();
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(extension)) {
    return "Formato no soportado (usá mp3, wav, flac, ogg, m4a o aac)";
  }
  if (file.size === 0) {
    return "El archivo está vacío";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "Supera el máximo de 200 MB";
  }
  return null;
}

/**
 * Sube un audio. Se usa XMLHttpRequest y no fetch porque solo así el navegador
 * informa el progreso de la subida. Los campos de texto van antes del archivo, como pide la API.
 */
export function uploadAsset(
  stationId: string,
  file: File,
  category: AssetCategory,
  onProgress: (fraction: number) => void,
): { promise: Promise<Asset>; abort: () => void } {
  const xhr = new XMLHttpRequest();

  const promise = new Promise<Asset>((resolve, reject) => {
    xhr.open("POST", `/api/stations/${stationId}/assets`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status === 401) {
        goToLogin();
        reject(new ApiError(401, "La sesión venció"));
      } else if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(xhr.response as Asset);
      } else {
        const message = (xhr.response as { error?: string } | null)?.error ?? "No se pudo subir el archivo";
        reject(new ApiError(xhr.status, message));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Se perdió la conexión durante la subida"));
    xhr.onabort = () => reject(new ApiError(0, "Subida cancelada"));

    const form = new FormData();
    form.append("category", category);
    form.append("file", file, file.name);
    xhr.send(form);
  });

  return { promise, abort: () => xhr.abort() };
}

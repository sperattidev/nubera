import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export class FileTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`El archivo supera el máximo de ${maxBytes} bytes`);
  }
}

export class EmptyFileError extends Error {
  constructor() {
    super("El archivo está vacío");
  }
}

export interface StoredFile {
  /** Ruta relativa dentro del almacenamiento. */
  key: string;
  sha256: string;
  sizeBytes: number;
}

export interface MediaStorage {
  save(source: Readable, extension: string): Promise<StoredFile>;
}

/**
 * Almacenamiento en disco direccionado por contenido (SHA-256): el mismo
 * archivo subido dos veces ocupa un solo lugar. Nunca borra archivos finales.
 */
export class LocalMediaStorage implements MediaStorage {
  constructor(
    private readonly root: string,
    private readonly maxBytes: number,
  ) {}

  async save(source: Readable, extension: string): Promise<StoredFile> {
    if (!/^\.[a-z0-9]{1,5}$/.test(extension)) {
      throw new Error(`Extensión inválida: ${extension}`);
    }

    const tmpDir = path.join(this.root, ".tmp");
    await mkdir(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, randomUUID());

    const hash = createHash("sha256");
    let sizeBytes = 0;
    const meter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        sizeBytes += chunk.length;
        if (sizeBytes > this.maxBytes) {
          callback(new FileTooLargeError(this.maxBytes));
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(source, meter, createWriteStream(tmpPath, { flags: "wx" }));
      if (sizeBytes === 0) {
        throw new EmptyFileError();
      }
    } catch (error) {
      await rm(tmpPath, { force: true });
      throw error;
    }

    const sha256 = hash.digest("hex");
    const key = `${sha256.slice(0, 2)}/${sha256}${extension}`;
    const finalPath = path.join(this.root, key);
    await mkdir(path.dirname(finalPath), { recursive: true });

    if (await exists(finalPath)) {
      await rm(tmpPath, { force: true });
    } else {
      await rename(tmpPath, finalPath);
    }
    return { key, sha256, sizeBytes };
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

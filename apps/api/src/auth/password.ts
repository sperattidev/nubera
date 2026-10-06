import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

// scrypt (OWASP): N=2^15, r=8, p=1. Sin dependencias nativas.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY = 128 * N * R * 2;

function derive(password: string, salt: Buffer, keyLength: number, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
}

/** Formato: scrypt$N$r$p$salt(base64)$hash(base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, KEY_LENGTH, N, R, P);
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) {
    return false;
  }
  const expected = Buffer.from(hash, "base64");
  const candidate = await derive(password, Buffer.from(salt, "base64"), expected.length, Number(n), Number(r), Number(p));
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifica contra un hash descartable para que el tiempo de respuesta no
 * revele si el email existe.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
  return false;
}

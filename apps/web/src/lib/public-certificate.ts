import { isCertificateToken, type PublicCertificate } from "./certificate-links";
import { API_URL } from "./server";

/**
 * Certificado de emisión de un enlace público, o null si el enlace no existe, venció o fue revocado.
 * Si la API no responde se lanza el error, para no confundir una caída con "enlace vencido".
 */
export async function getPublicCertificate(token: string): Promise<PublicCertificate | null> {
  if (!isCertificateToken(token)) {
    return null;
  }
  const response = await fetch(`${API_URL}/public/certificates/${token}`, { cache: "no-store" });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`La API respondió ${response.status}`);
  }
  return (await response.json()) as PublicCertificate;
}

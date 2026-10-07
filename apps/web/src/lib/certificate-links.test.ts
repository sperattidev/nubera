import { describe, expect, it } from "vitest";
import { certificateUrl, isCertificateToken, linkStatus, whatsappUrl } from "./certificate-links";

const NOW = new Date("2026-10-10T12:00:00Z").getTime();

describe("linkStatus", () => {
  it("un enlace vigente está activo", () => {
    expect(linkStatus({ expiresAt: "2026-10-20T12:00:00Z", revokedAt: null }, NOW)).toBe("active");
  });

  it("vence exactamente en el instante indicado", () => {
    expect(linkStatus({ expiresAt: "2026-10-10T12:00:01Z", revokedAt: null }, NOW)).toBe("active");
    expect(linkStatus({ expiresAt: "2026-10-10T12:00:00Z", revokedAt: null }, NOW)).toBe("expired");
  });

  it("revocar manda sobre vencer", () => {
    expect(linkStatus({ expiresAt: "2026-10-01T00:00:00Z", revokedAt: "2026-10-02T00:00:00Z" }, NOW)).toBe("revoked");
    expect(linkStatus({ expiresAt: "2026-10-30T00:00:00Z", revokedAt: "2026-10-02T00:00:00Z" }, NOW)).toBe("revoked");
  });
});

describe("direcciones", () => {
  it("arma la dirección pública", () => {
    expect(certificateUrl("https://nubera.example.test", "/certificado/cert_abc")).toBe("https://nubera.example.test/certificado/cert_abc");
  });

  it("arma el mensaje de WhatsApp con el nombre y el enlace codificados", () => {
    const url = whatsappUrl("Ferretería Sur & Hijos", "https://nubera.example.test/certificado/cert_abc");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(url.slice("https://wa.me/?text=".length));
    expect(text).toBe("Certificado de emisión de Ferretería Sur & Hijos: https://nubera.example.test/certificado/cert_abc");
    expect(url).not.toContain(" ");
    expect(url).not.toContain("&Hijos");
  });
});

describe("isCertificateToken", () => {
  it("acepta solo el formato que genera la API", () => {
    expect(isCertificateToken(`cert_${"a".repeat(43)}`)).toBe(true);
    expect(isCertificateToken(`cert_${"a".repeat(42)}`)).toBe(false);
    expect(isCertificateToken(`nbr_${"a".repeat(43)}`)).toBe(false);
    expect(isCertificateToken(`cert_${"a".repeat(42)}/`)).toBe(false);
    expect(isCertificateToken("")).toBe(false);
  });
});

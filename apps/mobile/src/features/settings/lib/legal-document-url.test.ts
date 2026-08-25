import { afterEach, describe, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("isLegalDocumentUrl", () => {
  it("has no inherited legal destination in an unconfigured build", async () => {
    const { ALLOWED_LEGAL_DOCUMENT_URLS, LEGAL_URL, isLegalDocumentUrl } =
      await import("./legal-document-url");

    expect(LEGAL_URL).toBeNull();
    expect(ALLOWED_LEGAL_DOCUMENT_URLS).toEqual([]);
    expect(isLegalDocumentUrl("https://t3.codes/legal")).toBe(false);
  });

  it("allows only legal routes from the configured Croki site", async () => {
    vi.stubEnv("EXPO_PUBLIC_MARKETING_SITE_URL", "https://croki.example/product");
    const { isLegalDocumentUrl } = await import("./legal-document-url");

    expect(isLegalDocumentUrl("https://croki.example/product/legal/")).toBe(true);
    expect(isLegalDocumentUrl("https://croki.example/product/privacy-policy?source=app")).toBe(
      true,
    );
    expect(isLegalDocumentUrl("https://croki.example/legal")).toBe(false);
    expect(isLegalDocumentUrl("javascript:alert(1)")).toBe(false);
  });
});

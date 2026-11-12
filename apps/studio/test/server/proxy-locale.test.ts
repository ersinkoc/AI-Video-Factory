import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "../../src/proxy.ts";

vi.mock("server-only", () => ({}));
const req = vi.hoisted(() => ({ cookie: undefined as string | undefined, acceptLanguage: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "ys-lang" && req.cookie !== undefined ? { value: req.cookie } : undefined) }),
  headers: async () => ({ get: (name: string) => (name === "accept-language" ? req.acceptLanguage : null) }),
}));

const { getI18n, getLocale } = await import("../../src/lib/locale.ts");

const call = (method: string, headers: Record<string, string> = {}, path = "/api/episodes") =>
  proxy(new NextRequest(`http://localhost:3100${path}`, { method, headers: { host: "localhost:3100", ...headers } }));
const passed = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy: Stüdyo API'sine yalnız Stüdyo sayfası yazar", () => {
  it("sayfaları ve API'yi kapsar, derlenmiş statik dosyaları kapsamaz", () => {
    const matcher = new RegExp(`^${config.matcher}$`);
    for (const path of ["/", "/episodes/e1", "/api/episodes", "/style-previews/isometric.mp4"]) expect(matcher.test(path), path).toBe(true);
    for (const path of ["/_next/static/chunks/a.js", "/_next/image", "/favicon.ico"]) expect(matcher.test(path), path).toBe(false);
  });

  it("yalnız Stüdyo'nun kendi adlarına gelen istek yanıtlanır (ağdaki IP, DNS rebinding)", async () => {
    for (const host of ["localhost:3100", "LOCALHOST:3100", "127.0.0.1:3100", "[::1]:3100", "localhost"]) {
      expect(passed(call("GET", { host })), host).toBe(true);
    }
    // Yabancı ad 127.0.0.1'e çözülürse Origin ile Host birbirini tutar; ad listede olmadığı için yine geçmez.
    const rebinding = { host: "evil.example:3100", origin: "http://evil.example:3100", "sec-fetch-site": "same-origin", "content-type": "application/json" };
    for (const [method, headers, path] of [
      ["POST", rebinding, "/api/episodes"],
      ["GET", { host: "evil.example:3100" }, "/api/episodes"],
      ["GET", { host: "192.168.1.20:3100" }, "/episodes/e1"],
      ["GET", { host: "bozuk ad" }, "/"],
    ] as [string, Record<string, string>, string][]) {
      const res = call(method, headers, path);
      expect(res.status, headers.host).toBe(403);
      expect(await res.json()).toEqual({ error: "Yalnız Stüdyo'nun kendi adresinden" });
    }
    // Host başlığı hiç yoksa da geçmez.
    expect(proxy(new NextRequest("http://localhost:3100/api/episodes")).status).toBe(403);
  });

  it("YS_STUDIO_HOSTS ile eklenen ad da geçer", () => {
    vi.stubEnv("YS_STUDIO_HOSTS", " studio.lan , 192.168.1.20 ");
    try {
      expect(passed(call("GET", { host: "192.168.1.20:3100" }))).toBe(true);
      expect(passed(call("POST", { host: "Studio.LAN:3100", origin: "http://studio.lan:3100", "sec-fetch-site": "same-origin", "content-type": "application/json" }))).toBe(true);
      expect(call("GET", { host: "192.168.1.21:3100" }).status).toBe(403);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("sayfalara yazma denetimi uygulanmaz (yalnız /api)", () => {
    expect(passed(call("POST", { "sec-fetch-site": "cross-site" }, "/episodes/e1"))).toBe(true);
  });

  it("okuma istekleri serbest", () => {
    for (const m of ["GET", "HEAD", "OPTIONS"]) expect(passed(call(m, { "sec-fetch-site": "cross-site" }))).toBe(true);
  });

  it("aynı kökenden JSON yazma geçer", () => {
    expect(passed(call("POST", { "sec-fetch-site": "same-origin", origin: "http://localhost:3100", "content-type": "application/json" }))).toBe(true);
    expect(passed(call("PUT", { "sec-fetch-site": "none", "content-type": "application/json; charset=utf-8" }))).toBe(true);
    // Tarayıcı dışı istemci (sec-fetch-site yok, origin yok).
    expect(passed(call("POST", { "content-type": "application/json" }))).toBe(true);
  });

  it("başka siteden ya da başka kökenden yazma 403", async () => {
    const cases: Record<string, string>[] = [
      { "sec-fetch-site": "cross-site", "content-type": "application/json" },
      { "sec-fetch-site": "same-site", "content-type": "application/json" },
      { origin: "http://evil.example", "content-type": "application/json" },
      { "sec-fetch-site": "same-origin", origin: "http://localhost:9999", "content-type": "application/json" },
      { origin: "bozuk köken", "content-type": "application/json" },
    ];
    for (const h of cases) {
      const res = call("POST", h);
      expect(res.status, JSON.stringify(h)).toBe(403);
      expect(await res.json()).toEqual({ error: "Yalnız Stüdyo sayfasından" });
    }
  });

  it("JSON olmayan gövde 415 (çapraz 'basit' istek ön izinsiz gönderilemesin)", async () => {
    for (const h of [{ "content-type": "text/plain" }, {}] as Record<string, string>[]) {
      const res = call("POST", { "sec-fetch-site": "same-origin", ...h });
      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({ error: "JSON gerekli" });
    }
  });
});

describe("locale", () => {
  beforeEach(() => {
    req.cookie = undefined;
    req.acceptLanguage = null;
  });

  it("seçilen dil çerezden okunur", async () => {
    req.cookie = "en";
    req.acceptLanguage = "tr-TR";
    expect(await getLocale()).toBe("en");
  });

  it("çerez yoksa ya da geçersizse tarayıcı dili", async () => {
    req.acceptLanguage = "tr-TR,tr;q=0.9";
    expect(await getLocale()).toBe("tr");
    req.cookie = "de";
    req.acceptLanguage = null;
    expect(await getLocale()).toBe("en");
  });

  it("getI18n dile göre çevirmen ve biçimlendirici verir", async () => {
    req.cookie = "tr";
    const { locale, t, fmt } = await getI18n();
    expect(locale).toBe("tr");
    expect(t("nav.episodes")).toBe("Bölümler");
    expect(fmt.number(1234)).toBe("1.234");
  });
});

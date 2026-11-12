import { NextResponse, type NextRequest } from "next/server";

/** Stüdyo'nun kendi makinesindeki adları; başka ad (ağdaki IP, alan adı) YS_STUDIO_HOSTS ile açıkça eklenir. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * İstek Stüdyo'nun bilinen bir adına mı geldi. Yabancı bir alan adı 127.0.0.1'e çözülürse (DNS rebinding) tarayıcı o
 * sayfayı Stüdyo ile "aynı köken" sayar: Origin ve Host birbirini tutar, sayfa bölümleri okuyup ücretli iş başlatabilir
 * (12 Kas: `Host: evil.example:3100` + eşleşen Origin ile yazma isteği 200 dönüyordu). Ad listede yoksa hiçbir sayfa ve
 * uç nokta yanıt vermez. Değişken her istekte okunur: Stüdyo'yu başlatan kabukta verilir.
 */
function knownHost(host: string): boolean {
  let name: string;
  try {
    name = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  if (LOCAL_HOSTS.has(name)) return true;
  return (process.env.YS_STUDIO_HOSTS ?? "").split(",").some((h) => h.trim().toLowerCase() === name);
}

/**
 * Stüdyo yalnız kendi adlarından açılır ve API'sine yalnız Stüdyo sayfası yazabilir. Tarayıcıda açık başka bir site
 * localhost:3100'e "basit" bir POST gönderip bölüm oluşturabiliyor ve ücretli iş başlatabiliyordu (30 Eki incelemesi):
 * yazma istekleri aynı kökenden ve JSON olmalı (JSON gövdeli çapraz istek tarayıcıda önce izin sorar, izin verilmez).
 */
export function proxy(req: NextRequest) {
  // Ad büyük/küçük harfe duyarsızdır; Origin ile karşılaştırma da küçük harfle yapılır.
  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (!knownHost(host)) return NextResponse.json({ error: "Yalnız Stüdyo'nun kendi adresinden" }, { status: 403 });
  if (!req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return NextResponse.next();
  const site = req.headers.get("sec-fetch-site");
  const origin = req.headers.get("origin");
  let sameOrigin = site === null || site === "same-origin" || site === "none";
  if (origin) {
    try {
      sameOrigin &&= new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin) return NextResponse.json({ error: "Yalnız Stüdyo sayfasından" }, { status: 403 });
  if (!(req.headers.get("content-type") ?? "").startsWith("application/json")) {
    return NextResponse.json({ error: "JSON gerekli" }, { status: 415 });
  }
  return NextResponse.next();
}

/** Sayfalar da kapsanır (ad denetimi); derlenmiş statik dosyalar hariç. */
export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };

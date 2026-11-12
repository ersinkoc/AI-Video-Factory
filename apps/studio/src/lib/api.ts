import { errorText, formatText, isLocalizedError, LocalizedError, msg, type Text } from "@ys/core/messages";
import { isLocale, LOCALE_COOKIE, localeFromHeader, type Locale } from "./i18n";

/** API isteğinin dili: seçilen dil (çerez `ys-lang`), yoksa tarayıcının dili. */
export function requestLocale(req: Request): Locale {
  const cookie = req.headers.get("cookie") ?? "";
  const chosen = new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]*)`).exec(cookie)?.[1];
  return isLocale(chosen) ? chosen : localeFromHeader(req.headers.get("accept-language"));
}

/** İsteğin dilinde metin. */
export const localize = (req: Request, text: Text): string => formatText(requestLocale(req), text);

/** JSON hata yanıtı `{ error }` isteğin dilinde. */
export const apiError = (req: Request, text: Text, status = 400): Response =>
  Response.json({ error: localize(req, text) }, { status });

/** Yakalanan hatanın yanıtı: çevrilebilir hata seçili dilde, düz hata olduğu gibi. */
export const errorResponse = (req: Request, e: unknown, status = 400): Response => apiError(req, errorText(e), status);

/**
 * İsteğin JSON gövdesi, nesne olarak. Bozuk JSON ya da nesne olmayan gövde (null, dizi, düz değer) çevrilebilir hatadır:
 * uç noktalar bunu 400 ile bildirir. Önceden gövde try dışında okunuyordu; bozuk gövde işlenmemiş istisnayla 500
 * veriyor, `null` gövde alan okunurken TypeError atıyor ya da (model ayarları) kayıtlı seçimleri boş nesneyle eziyordu.
 */
export async function readJson<T extends object>(req: Request): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new LocalizedError(msg("api.badJson"));
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new LocalizedError(msg("api.badJson"));
  return body as T;
}

/** Hata "bölüm bulunamadı" mı: 404 yalnız bunun yanıtıdır, başka hata (okunamayan defter, tahmin) 500'dür. */
export const isMissingEpisode = (e: unknown): boolean => isLocalizedError(e) && e.text.key === "err.episode.notFound";

/** Düz metin yanıtı (video, varlık uç noktaları) isteğin dilinde. */
export const textResponse = (req: Request, text: Text, status: number): Response => new Response(localize(req, text), { status });

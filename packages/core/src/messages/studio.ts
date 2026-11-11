/**
 * studio mesajları (bkz. ./index.ts): Stüdyo API yanıtlarındaki hatalar. İsteğin dilinde (çerez `ys-lang`, yoksa
 * Accept-Language) döner. Türkçeleri önceki yanıtlarla aynıdır (istemcinin eski hata eşlemesi bunlara bakar).
 */
export const STUDIO_MESSAGES = {
  "api.style.reference": { tr: "Geçerli bir PNG, JPEG veya WebP görseli seç (en çok 4 MB).", en: "Choose a valid PNG, JPEG or WebP image (up to 4 MB)." },
  "api.style.recipe": { tr: "Stil alanlarını ve en az üç #RRGGBB rengini kontrol et.", en: "Check the style fields and at least three #RRGGBB colours." },
  "api.style.missing": { tr: "Kaydedilmiş stil bulunamadı.", en: "Saved style not found." },
  "api.style.bank": { tr: "Özel stil ile hazır stilin karakter bankası birlikte seçilemez.", en: "A custom style cannot be combined with characters from a ready-made style." },
  "api.badEpisode": { tr: "Geçersiz bölüm", en: "Invalid episode" },
  "api.busy": { tr: "Önce çalışan iş bitmeli", en: "Wait for the running job to finish first" },
  "api.badMotion": { tr: "Geçersiz hareket modu", en: "Invalid motion mode" },
  "api.badAction": { tr: "Bilinmeyen eylem: {type}", en: "Unknown action: {type}" },
  "api.topic": { tr: "Konu gerekli", en: "A topic is required" },
  "api.bank.fields": { tr: "Ad ve tarif gerekli (çizgi stili geçerli olmalı)", en: "A name and a description are required (and a valid line style)" },
  "api.minutes": { tr: "Süre 0,5–30 dk olmalı", en: "Length must be 0.5–30 min" },
  "api.budget": { tr: "Bütçe pozitif olmalı", en: "Budget must be positive" },
  "api.jobRunning": { tr: "Zaten çalışan bir iş var: {label}", en: "A job is already running: {label}" },
  "api.noVideo": { tr: "Video yok", en: "No video" },
  "api.noVideoFile": { tr: "Video dosyası yok", en: "Video file missing" },
  "api.noShort": { tr: "Short yok (yatay bölümde short aşamasıyla üretilir)", en: "No Short (made by the short stage of a horizontal episode)" },
  "api.noThumbnail": { tr: "Küçük resim yok (bölümü yeniden render et)", en: "No thumbnail (render the episode again)" },
  "api.noSubtitles": { tr: "Altyazı dosyası yok (bölümü yeniden render et)", en: "No subtitle file (render the episode again)" },
  "api.forbidden": { tr: "Yasak", en: "Forbidden" },
  "api.notFound": { tr: "Yok", en: "Not found" },
} as const;

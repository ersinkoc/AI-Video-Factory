/** `pnpm ys skills`: kodlama oturumları için dış 3D skill'leri ve MCP sunucusu. */
export const DEVTOOLS_MESSAGES = {
  "devtools.heading": {
    tr: "Kodlama oturumları için 3D araçları (Claude Code). Kullanıcı hesabına, tüm projelere kurulur (~/.claude); pipeline bunları kullanmaz. Ayrıntı: docs/3D_REFERENCES.md",
    en: "3D tools for coding sessions (Claude Code). Installed for the user account, in every project (~/.claude); the pipeline does not use them. Details: docs/3D_REFERENCES.md",
  },
  "devtools.ready": { tr: "kurulu", en: "installed" },
  "devtools.missing": { tr: "kurulu değil", en: "not installed" },
  "devtools.partial": { tr: "eksik ({installed}/{total})", en: "partial ({installed}/{total})" },
  "devtools.unknown": { tr: "Bilinmeyen araç: {id}. Seçenekler: {ids}", en: "Unknown tool: {id}. Options: {ids}" },
  "devtools.skip": { tr: "{id} zaten kurulu, atlandı.", en: "{id} is already installed, skipped." },
  "devtools.installing": { tr: "{id} kuruluyor: {command}", en: "Installing {id}: {command}" },
  "devtools.done": { tr: "{id} kuruldu.", en: "{id} installed." },
  "devtools.failed": { tr: "{id} kurulamadı (çıkış: {code}).", en: "{id} could not be installed (exit: {code})." },
  "devtools.timeout": { tr: "{minutes} dakikada bitmedi, durduruldu.", en: "Did not finish in {minutes} minutes, stopped." },
  "devtools.restart": { tr: "Yeni skill'ler ve MCP sunucusu, Claude Code yeniden başlatılınca görünür.", en: "New skills and the MCP server appear after Claude Code restarts." },
} as const;

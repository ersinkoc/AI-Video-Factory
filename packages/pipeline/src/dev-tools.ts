/**
 * Kodlama oturumları (Claude Code) için seçilmiş dış 3D skill'leri ve MCP sunucusu: katalog, kurulum durumu ve kurulum
 * komutu. Pipeline bunları hiç kullanmaz; `pnpm ys skills` ve Stüdyo → Geliştirici araçları kurar. Gerekçe ve proje
 * kuralları: docs/3D_REFERENCES.md. 27 Kas: kullanıcı "kurmayı bir menüye koy, hepsini değil, bize yardımcı olanları" dedi.
 *
 * Her kaynak bir commit'e sabitlenir (kaynak sonradan değişse de aynı dosyalar kurulur), `skills` CLI ve MCP paketi
 * tam sürümle çağrılır. Argümanlar yalnız bu katalogdan gelir; Windows'ta npx/claude .cmd olduğu için kabukla açılır,
 * katalogda kabuk karakteri yoktur (test eder).
 */
import { readFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export type DevToolKind = "skills" | "mcp";

export interface DevTool {
  id: string;
  kind: DevToolKind;
  /** GitHub owner/repo. */
  repo: string;
  licence: string;
  /** skills: kaynağın sabit commit'i. */
  commit?: string;
  /** skills: kurulacak skill adları (repodaki her şey değil). */
  skills: readonly string[];
  /** mcp: npm paketi, tam sürümle. */
  pkg?: string;
}

/** Stüdyo iş anahtarı (bölüm kimliği yerine). */
export const DEV_TOOLS_JOB = "dev-tools";

/** vercel-labs/skills; 1.9.1 kurulumdan bir gün önce çıktı, bir önceki kullanılır. -g -a claude-code ile ~/.claude/skills'e kopyalar. */
export const SKILLS_CLI = "skills@1.9.0";

/** Tek kurulumun üst sınırı: takılan bir istem işi sonsuza dek "çalışıyor" bırakmasın. */
export const DEV_TOOL_TIMEOUT_MS = 5 * 60_000;

export const DEV_TOOLS: readonly DevTool[] = [
  {
    // Güncel three.js API'si ve "Common Mistakes" listeleri. interaction, loaders, react-three-fiber ve asset-pipeline
    // alınmadı: Remotion içinde ham three kullanıyoruz, kontrol, glTF ve R3F yok.
    id: "threejs-skills",
    kind: "skills",
    repo: "CloudAI-X/threejs-skills",
    licence: "MIT",
    commit: "0e181866f095b5f06d005133876e926515390d95",
    skills: [
      "threejs-fundamentals",
      "threejs-geometry",
      "threejs-materials",
      "threejs-lighting",
      "threejs-textures",
      "threejs-animation",
      "threejs-shaders",
      "threejs-postprocessing",
      "threejs-performance",
    ],
  },
  {
    // GLSL ve parçacık tarifleri. Bu repodaki threejs-animation, CloudAI-X'inkiyle aynı adı taşıdığı için alınmadı.
    id: "webgl-animation-skills",
    kind: "skills",
    repo: "iart-ai/webgl-animation-skills",
    licence: "MIT",
    commit: "0041933813688c357804f7b13dcb85095c5a3210",
    skills: ["shader-glsl", "particle-system"],
  },
  {
    // Işık, kamera, malzeme rehberi (references/cinematography.md); kendi render hattı bu projede kullanılmaz.
    id: "cinematic-3d-video",
    kind: "skills",
    repo: "cumalibilgic/cinematic-3d-video",
    licence: "MIT",
    commit: "d38ea1b6d93f2710fe6e235a0a50ed98c37dcc34",
    skills: ["cinematic-3d-video"],
  },
  {
    // Çalışan three.js sahnesini incelemek; bu repoda denenmedi.
    id: "threejs-devtools-mcp",
    kind: "mcp",
    repo: "DmitriyGolub/threejs-devtools-mcp",
    licence: "MIT",
    pkg: "threejs-devtools-mcp@0.5.0",
    skills: [],
  },
];

export const devToolOf = (id: string): DevTool | undefined => DEV_TOOLS.find((t) => t.id === id);

export interface DevToolStatus {
  id: string;
  /** Kurulu parça sayısı (skill ya da MCP kaydı). */
  installed: number;
  total: number;
  ready: boolean;
}

/** Bilinmeyen kimlik yoksa kimlikler (tekrarsız, katalog sırasında); varsa undefined. */
export function devToolIds(ids: readonly unknown[]): string[] | undefined {
  if (!ids.every((id): id is string => typeof id === "string" && devToolOf(id) !== undefined)) return undefined;
  return DEV_TOOLS.filter((t) => ids.includes(t.id)).map((t) => t.id);
}

const exists = (path: string) => access(path).then(() => true, () => false);

/** Kullanıcı kapsamındaki MCP sunucu adları (~/.claude.json). Dosyanın geri kalanı (oturum bilgileri) okunmaz, döndürülmez. */
async function mcpServers(home: string): Promise<Set<string>> {
  try {
    const config = JSON.parse(await readFile(join(home, ".claude.json"), "utf8")) as { mcpServers?: unknown };
    const servers = config.mcpServers;
    return new Set(servers && typeof servers === "object" ? Object.keys(servers) : []);
  } catch {
    return new Set();
  }
}

/** Her aracın kurulu olup olmadığı: skill'ler ~/.claude/skills/<ad>/SKILL.md, MCP kullanıcı ayarındaki kayıt. */
export async function devToolStatus(home: string = homedir()): Promise<DevToolStatus[]> {
  const servers = await mcpServers(home);
  return Promise.all(
    DEV_TOOLS.map(async (tool) => {
      const found = tool.kind === "mcp"
        ? (servers.has(tool.id) ? 1 : 0)
        : (await Promise.all(tool.skills.map((s) => exists(join(home, ".claude", "skills", s, "SKILL.md"))))).filter(Boolean).length;
      const total = tool.kind === "mcp" ? 1 : tool.skills.length;
      return { id: tool.id, installed: found, total, ready: found === total };
    }),
  );
}

/** Aracı kullanıcı hesabına (tüm projeler) kuran komut. Windows'ta yerel MCP sunucusu npx'i `cmd /c` ile sarmalı açılır. */
export function devToolCommand(tool: DevTool, platform: string = process.platform): { command: string; args: string[] } {
  if (tool.kind === "mcp") {
    const launch = platform === "win32" ? ["cmd", "/c", "npx", "-y", tool.pkg!] : ["npx", "-y", tool.pkg!];
    return { command: "claude", args: ["mcp", "add", "--scope", "user", tool.id, "--", ...launch] };
  }
  return {
    command: "npx",
    args: ["-y", SKILLS_CLI, "add", `${tool.repo}@${tool.commit}`, ...tool.skills.flatMap((s) => ["--skill", s]), "-g", "-a", "claude-code", "-y", "--copy"],
  };
}

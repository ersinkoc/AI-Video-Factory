import { defineConfig } from "vitest/config";

// Gerçek Git süreçleri: normal birim testlerinden ayrı, CI'da zorunlu yerel dosya/ref entegrasyonu.
export default defineConfig({ test: { include: ["scripts/release.integration.ts"], maxWorkers: 1, hookTimeout: 60_000, testTimeout: 90_000 } });

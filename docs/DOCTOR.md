# Environment diagnostics

Run `pnpm ys doctor` before investigating a local render or setup failure. It inspects tools and configuration without generating media, installing software, starting a browser or contacting a paid provider.

```sh
pnpm ys doctor
pnpm --silent ys doctor --json
pnpm ys doctor --check-local
```

The CLI loads `.env` from its working directory, as its other commands do. Default diagnostics make no network requests. `--check-local` opts into one read-only ComfyUI `/system_stats` request, only when `COMFYUI_URL` names `localhost`, `127.0.0.1` or `[::1]` over HTTP(S). Credentials in the URL are refused, query/fragment values are removed, redirects are refused and the request is bounded to 2.5 seconds. The body is discarded. An HTTP success proves reachability, not that models or workflows are ready. Other local or remote hosts are reported as unavailable without a request.

## Checks and exit status

| Check | Required | Meaning |
| --- | --- | --- |
| Node.js | Yes | Major version is at least 24 |
| Invoking pnpm | No | The calling pnpm version from its user-agent matches root `packageManager`; unknown/mismatched versions warn |
| FFmpeg / ffprobe | Yes | `-version` executes on PATH within five seconds; only a numeric version excerpt is retained |
| FFmpeg filters | Yes | The PATH build lists the filters used by render/audit/alignment: `fps`, `scale`, `crop`, `format`, `setpts`, `blackdetect`, `freezedetect`, `loudnorm`, `silencedetect`, `astats`, `ametadata`, `aresample`, `asetnsamples` |
| Browser | Yes | The configured `YS_BROWSER_EXECUTABLE` or Remotion's cached headless-shell is a readable executable file; it is not launched |
| Bundled fonts | Yes | All 14 distinct heading/body Latin/Latin Extended WOFF files resolve and have valid headers/file lengths |
| Manim / LaTeX | No | Configured or standard repository/user locations execute `--version`; missing tools warn |
| Paid-provider credentials | No | Only presence of the four supported credential variable names is reported; authentication is skipped |
| ComfyUI | No | Skipped by default; optional local HTTP reachability check |

Exit **0** means none of the required checks failed. Exit **1** means a required check failed or the diagnostic command itself encountered an unexpected error. Optional warnings and skipped checks do not fail the command. JSON output has `version: 1`, `ok` and `checks`, with stable check IDs, `required`, `status` and an English explanation. Human-readable output follows the Turkish CLI convention. Both explanation languages live in the shared message catalog.

The full-render readiness check deliberately requires FFmpeg on PATH. The existing Remotion-bundled fallback can support some audio/render operations, but does not substitute for every filter. The browser lookup uses a read-only cache query from the project's pinned Remotion version and is guarded against missing packages/cache files. No automatic download is attempted. Font glyph coverage, actual rasterization, GPU behavior, media quality, provider authentication and a successful complete render are separate checks. See [Continuous verification](CI.md).

The report contains neither credential values nor configured URLs. Raw subprocess stdout/stderr and exception messages are not printed; subprocess calls use argument arrays, no shell, a five-second timeout, a 1 MiB output limit and hidden windows. The command dispatches before provider registry and cost-ledger initialization, so a malformed provider manifest or database-backed ledger does not prevent these diagnostics. It does not change episode state or create a cost ledger.

## CI and validation

The offline media CI job records `doctor.json` after rendering has installed/found its browser. The diagnostic report is retained alongside the render evidence. Optional tools can warn on a clean runner without failing required media checks. This does not configure branch protection or establish a hosted CI pass.

Unit tests mock processes, files and HTTP. They cover missing and malformed tools/fonts, permission errors, Windows/Linux tool paths, FFmpeg filter formats with two/three flag columns, package-manager mismatch, credential redaction, local URL restrictions, HTTP failures and JSON/text exit behavior. A CLI wiring test verifies that diagnostics do not initialize a pipeline, gateway or database ledger.

## Verification on 12 November 2026

Validated on Windows with Node.js 26.13.0 and pnpm 11.25.0, against base `4057df4` plus the existing working-tree changes. The final full run passed 2,146 tests in 194 files, with the two opt-in PostgreSQL/RustFS cases skipped. All four coverage metrics were 100%. Typecheck, Studio production build, `actionlint` and `git diff --check` also passed. The storage integrations were not repeated in this diagnostics round; their separate earlier verification is recorded in [CI](CI.md).

The real JSON command exited 0 and parsed as JSON. Node, pnpm, FFmpeg/ffprobe 9.0.2, all 13 listed filters, the browser candidate, all 14 font headers, Manim and LaTeX passed in the final live report. An earlier loaded run reported an optional Manim warning, so this is a bounded probe rather than a startup-performance guarantee. Paid-provider validation and the default ComfyUI request were explicitly skipped. A deliberately nonexistent browser override produced exit 1 and a failed browser check.

A temporary loopback HTTP server observed exactly one `GET /system_stats` request from the real CLI with `--check-local`; the server was closed after verification. The actual configured credential values were checked absent from the final JSON report. No paid generation or episode-state change occurred. Windows/Linux path variants were unit-tested; native Linux and hosted GitHub Actions were not run. Socket MaxListeners warnings remained in the suite output without a leak diagnosis.

Logs, live reports, the FFmpeg-format red/green proof, input hashes and HTTP/redaction evidence are retained under `.temp_files/doctor-2026-11-12/`. Existing source changes were preserved. No commit, push or new release was performed.

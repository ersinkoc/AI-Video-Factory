import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
const tool = vi.hoisted(() => vi.fn());
vi.mock("../src/tools.ts", () => ({ runMediaTool: tool }));
import { measureVoiceAudio } from "../src/voice-audit.ts";
afterEach(() => tool.mockReset());
const probe = { stdout: JSON.stringify({ streams: [{ codec_type: "audio", duration: "0.1", channels: 1, sample_rate: "48000" }] }), stderr: "" };
describe("voice media measurement boundary", () => {
  it("decodes only the voice stream at its original sample rate with bounded tool calls", async () => {
    tool.mockResolvedValueOnce(probe).mockResolvedValueOnce({ stdout: "frame:0 pts:0 pts_time:0\nlavfi.astats.Overall.RMS_level=-inf\nlavfi.astats.Overall.Peak_level=-inf\nlavfi.astats.Overall.Number_of_samples=4800\n", stderr: "" });
    const result = await measureVoiceAudio(new Uint8Array([1]), "audio/wav");
    expect(result).toMatchObject({ durationMs: 100, sampleRate: 48000, channels: 1 }); expect(result.blocks[0]!.rmsDbfs).toBeNull();
    expect(tool.mock.calls[1]![1]).toEqual(expect.arrayContaining(["-map", "0:a:0", "-vn"])); expect(tool.mock.calls[1]![3]).toMatchObject({ timeout: 120000, maxBuffer: 16777216 });
    const file = tool.mock.calls[0]![1].at(-1); expect(existsSync(file)).toBe(false);
  });
  it("cleans temporary input on decoder failure and rejects unsupported duration or MIME", async () => {
    tool.mockRejectedValueOnce(new Error("Decode failed"));
    await expect(measureVoiceAudio(new Uint8Array([1]), "audio/wav")).rejects.toThrow("Decode failed");
    expect(existsSync(tool.mock.calls[0]![1].at(-1))).toBe(false);
    await expect(measureVoiceAudio(new Uint8Array([1]), "text/plain")).rejects.toThrow("MIME");
    tool.mockResolvedValueOnce({ stdout: JSON.stringify({ streams: [{ codec_type: "audio", duration: "1201" }] }), stderr: "" });
    await expect(measureVoiceAudio(new Uint8Array([1]), "audio/wav")).rejects.toThrow("1,200");
    await expect(measureVoiceAudio(new Uint8Array(), "audio/wav")).rejects.toThrow("64 MiB");
  });
});

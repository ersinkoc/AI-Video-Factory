// @vitest-environment happy-dom
import { act as reactAct, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, makeData, makeState, okAct, renderIn, tr } from "./fixtures.tsx";

// Gerçek oynatıcı (Remotion) ve sahne kodu (three, pixi, paper) testte yüklenmez: oynatıcıya verilenler kaydedilir.
const played = vi.hoisted(() => [] as Record<string, unknown>[]);
// Oynatıcının denetimleri (ref): atlama ve oynatma çağrıları kaydedilir.
const controls = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@remotion/player", async () => {
  const { forwardRef, useImperativeHandle } = await import("react");
  return {
    Player: forwardRef((props: Record<string, unknown>, ref) => {
      useImperativeHandle(ref, () => ({
        seekTo: (f: number) => controls.calls.push(`seek:${f}`),
        play: () => controls.calls.push("play"),
      }));
      played.push(props);
      return <div data-testid="player" />;
    }),
  };
});
vi.mock("@ys/video", () => ({ Episode: () => null }));
// next/dynamic: yüklenen bileşen eşzamanlı verilir (gerçeği ilk çizimde boş döner); yükleyici ve seçenekler kaydedilir.
const loaded = vi.hoisted(() => [] as { module: Promise<{ default: unknown }>; options: unknown }[]);
vi.mock("next/dynamic", async () => {
  const { default: Player } = await import("../../src/app/episodes/[id]/timeline-player.tsx");
  return { default: (loader: () => Promise<{ default: unknown }>, options: unknown) => { loaded.push({ module: loader(), options }); return Player; } };
});

const { LocaleProvider } = await import("../../src/app/locale-provider.tsx");
const { default: TimelinePlayer, STATIC_BASE } = await import("../../src/app/episodes/[id]/timeline-player.tsx");
const { ShotsTab } = await import("../../src/app/episodes/[id]/steps.tsx");

const TIMELINE = {
  episodeId: "e1",
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 300,
  visuals: [{ shotId: "sh1", fromFrame: 0 }, { shotId: "sh2", fromFrame: 150 }],
  audio: [],
  captions: [],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  played.length = 0;
  controls.calls.length = 0;
  delete (window as { remotion_staticBase?: string }).remotion_staticBase;
});

describe("TimelinePlayer: bölümü render etmeden oynatır", () => {
  it("zaman çizelgesini yükler, statik kökü ayarlar ve oynatıcıya bölümün boyutlarını verir", async () => {
    const fetchMock = vi.fn(async () => json(TIMELINE));
    vi.stubGlobal("fetch", fetchMock);
    renderIn(<TimelinePlayer id="e1" />);
    expect(screen.getByText(tr("shots.play.loading"))).toBeTruthy();
    expect(await screen.findByTestId("player")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/episodes/e1/timeline", expect.objectContaining({ cache: "no-store" }));
    expect(window.remotion_staticBase).toBe(STATIC_BASE);
    expect(played.at(-1)).toMatchObject({
      inputProps: { timeline: TIMELINE },
      durationInFrames: 300,
      fps: 30,
      compositionWidth: 1920,
      compositionHeight: 1080,
      controls: true,
    });
    expect(screen.getByText(tr("shots.play.note"))).toBeTruthy();
    // Çekim istenmeden açılan oynatıcı başta durur.
    expect(controls.calls).toEqual([]);
  });

  it("istenen çekimin ilk karesine atlar ve oynar; aynı çekim yeniden istenebilir, bilinmeyen çekim yok sayılır", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(TIMELINE)));
    const scrolled = vi.fn();
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(scrolled);
    const view = renderIn(<TimelinePlayer id="e1" shot="sh2" seek={1} />);
    await screen.findByTestId("player");
    expect(controls.calls).toEqual(["seek:150", "play"]);
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });

    const again = (shot: string, seek: number) => view.rerender(<LocaleProvider locale="tr"><TimelinePlayer id="e1" shot={shot} seek={seek} /></LocaleProvider>);
    again("sh2", 2);
    expect(controls.calls).toEqual(["seek:150", "play", "seek:150", "play"]);
    again("nope", 3);
    expect(controls.calls).toHaveLength(4);
    scroll.mockRestore();
  });

  it("sunucunun hatasını gösterir; hata metni yoksa ya da istek düşerse genel hata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Zaman çizelgesi yok" }, 404)));
    const first = renderIn(<TimelinePlayer id="e1" />);
    expect((await screen.findByRole("alert")).textContent).toBe("Zaman çizelgesi yok");
    first.unmount();

    vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
    const second = renderIn(<TimelinePlayer id="e2" />);
    expect((await screen.findByRole("alert")).textContent).toBe(tr("shots.play.error"));
    second.unmount();

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("ağ yok"); }));
    renderIn(<TimelinePlayer id="e3" />);
    expect((await screen.findByRole("alert")).textContent).toBe(tr("shots.play.error"));
    expect(played).toHaveLength(0);
  });

  it("kaldırılan oynatıcıya geç gelen yanıt (başarılı ya da hatalı) durumu değiştirmez", async () => {
    let answer!: (r: Response) => void;
    let fail!: (e: Error) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((res) => { answer = res; })));
    const ok = renderIn(<TimelinePlayer id="e1" />);
    ok.unmount();
    await reactAct(async () => { answer(json(TIMELINE)); });

    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((_, rej) => { fail = rej; })));
    const bad = renderIn(<TimelinePlayer id="e2" />);
    bad.unmount();
    await reactAct(async () => { fail(new Error("iptal")); });
    expect(played).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ShotsTab: render etmeden oynat", () => {
  const shots = [{ id: "sh1", sceneId: "s1", startSec: 0, durationSec: 5, prompt: "p" }] as unknown as NonNullable<ReturnType<typeof makeState>["shots"]>;

  it("oynatıcı yalnız tarayıcıda ve istenince yüklenen ayrı bir parçadır", async () => {
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.options).toEqual({ ssr: false });
    expect((await loaded[0]!.module).default).toBe(TimelinePlayer);
  });

  it("düğme yalnız zaman çizelgesi hazırken görünür, oynatıcıyı açıp kapatır", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(TIMELINE)));
    const view = renderIn(<ShotsTab data={makeData(makeState({ shots }))} busy={false} act={okAct()} />);
    expect(screen.queryByRole("button", { name: new RegExp(tr("shots.play")) })).toBeNull();
    view.unmount();

    renderIn(<ShotsTab data={makeData(makeState({ shots, done: { timeline: "t" } }))} busy act={okAct()} />);
    // İş sürerken de açılabilir: yalnız okur.
    fireEvent.click(screen.getByRole("button", { name: new RegExp(tr("shots.play")) }));
    expect(await screen.findByTestId("player")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(tr("shots.play.close")) }));
    expect(screen.queryByTestId("player")).toBeNull();
  });

  it("çekimden oynat: kart ve ayrıntı düğmesi oynatıcıyı o çekimde açar; zaman çizelgesi yokken düğme çıkmaz", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(TIMELINE)));
    const scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
    const view = renderIn(<ShotsTab data={makeData(makeState({ shots }))} busy={false} act={okAct()} />);
    expect(screen.queryByRole("button", { name: new RegExp(tr("shots.playFrom")) })).toBeNull();
    view.unmount();

    renderIn(<ShotsTab data={makeData(makeState({ shots, done: { timeline: "t" } }))} busy={false} act={okAct()} />);
    fireEvent.click(screen.getByRole("button", { name: `${tr("shots.playFrom")} #1` }));
    await screen.findByTestId("player");
    expect(controls.calls).toEqual(["seek:0", "play"]);

    // Ayrıntıdan: pencere kapanır, açık oynatıcı aynı çekime yeniden atlar.
    fireEvent.click(screen.getByText("sh1").closest("button")!);
    expect(screen.getByRole("dialog")).toBeTruthy();
    await reactAct(async () => {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${tr("shots.playFrom")}$`) }));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(controls.calls).toEqual(["seek:0", "play", "seek:0", "play"]);
    scroll.mockRestore();
  });
});

// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { RECIPE } from "../../../../packages/core/test/style-recipe-fixture.ts";
import { CustomStyleEditor } from "../../src/app/custom-style-editor.tsx";
import { StyleGallery } from "../../src/app/style-gallery.tsx";
import { NewEpisodeForm } from "../../src/app/new-episode-form.tsx";
import { json, makeEstimates, renderIn, tr } from "./fixtures.tsx";
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const referenceKey = "library/style-references/" + "a".repeat(64) + ".jpg";
const saved = { id: "a".repeat(32), createdAt: "2026-11-07", recipe: RECIPE, referenceKey };
const edited = { ...saved, id: "b".repeat(32) };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); router.push.mockClear(); });
function Host({ initial = "" }: { initial?: string }) {
 const [id, setId] = useState<string | undefined>(initial || undefined), [dirty, setDirty] = useState(false);
 return <><CustomStyleEditor active selected={id} onSelect={setId} onDirty={setDirty} /><output data-testid="chosen">{id}</output><output data-testid="dirty">{String(dirty)}</output></>;
}
const file = () => new File([new Uint8Array([1,2,3])], "reference.png", { type: "image/png" });
const upload = (f: File | undefined) => fireEvent.change(screen.getByLabelText(tr("custom.image")), { target: { files: f ? [f] : [] } });

describe("motion gallery", () => {
 it("offers three local poster cards without library samples and loads only the selected controllable video", () => {
  const pick = vi.fn();
  const view = renderIn(<StyleGallery samples={{}} pack="auto" onPick={pick} />);
  expect(view.container.querySelectorAll("video")).toHaveLength(0);
  const cards = screen.getAllByRole("button"); expect(cards).toHaveLength(3);
  fireEvent.click(cards[0]!); expect(pick).toHaveBeenCalledWith("paper-cutout");
  view.rerender(<StyleGallery samples={{}} pack="paper-cutout" onPick={pick} />);
  const video = view.container.querySelector("video")!;
  expect(video.controls).toBe(true); expect(video.autoplay).toBe(false); expect(video.preload).toBe("metadata");
  expect(video.getAttribute("src")).toContain("/style-previews/paper-cutout.mp4");
  view.rerender(<StyleGallery samples={{}} pack="risograph" onPick={pick} />);
  expect(view.container.querySelector("video")).not.toBe(video);
 });
});
describe("reference style editor", () => {
 it("measures without a model, applies colors only on request, and clears stale measurements on replacement", async () => {
  const profile = { version: 1, sha256: "a".repeat(64), width: 100, height: 50, sampledPixels: 5000,
    palette: [{ color: "#ffffff", share: .6 }, { color: "#111111", share: .3 }, { color: "#ff0000", share: .1 }],
    tone: { p10: .2, median: .9, p90: 1, darkShare: .3, lightShare: .6 }, contrastSpan: .8, edgeDensity: .1 };
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
   if (!init) return json([saved]);
   requests.push(url); return json({ referenceKey, profile, cached: true });
  }));
  renderIn(<Host initial={saved.id} />); await screen.findByLabelText(tr("custom.field.palette"));
  const previous = (screen.getByLabelText(tr("custom.field.palette")) as HTMLInputElement).value;
  upload(file()); fireEvent.click(screen.getByText(tr("custom.measure")));
  await screen.findByTestId("reference-profile");
  expect(requests).toEqual(["/api/styles/measure"]);
  expect(screen.queryByText(/Bu analizin maliyeti/)).toBeNull();
  expect((screen.getByLabelText(tr("custom.field.palette")) as HTMLInputElement).value).toBe(previous);
  fireEvent.click(screen.getByText(tr("custom.applyPalette")));
  expect((screen.getByLabelText(tr("custom.field.palette")) as HTMLInputElement).value).toBe("#ffffff, #111111, #ff0000");
  expect(screen.getByTestId("dirty").textContent).toBe("true");
  upload(file()); expect(screen.queryByTestId("reference-profile")).toBeNull();
 });
 it("selects a saved style, edits every recipe field, saves a new version and can return to free art direction", async () => {
  const requests: object[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
   if (!init) return json([saved]);
   const body = JSON.parse(String(init.body)); requests.push(body);
   return json({ ...edited, recipe: body.recipe });
  }));
  renderIn(<Host initial={saved.id} />);
  await screen.findByLabelText(tr("custom.field.name"));
  for (const field of ["name", "artStyle", "promptPrefix", "lighting", "lensLanguage", "designNotes", "motionRules", "typographyRules"] as const) {
   fireEvent.change(screen.getByLabelText(tr(`custom.field.${field}`)), { target: { value: field === "name" ? "My edited style" : RECIPE[field] + " revised" } });
  }
  fireEvent.change(screen.getByLabelText(tr("custom.field.palette")), { target: { value: "#112233, #445566, #778899" } });
  for (const [field, value] of [["lineStyle","ink"],["texture","grain"],["craftPreset",""]] as const) fireEvent.change(screen.getByLabelText(tr(`custom.field.${field}`)), { target: { value } });
  for (const field of ["negativeRules","reviewRules"] as const) fireEvent.change(screen.getByLabelText(tr(`custom.field.${field}`)), { target: { value: "First rule\nSecond rule" } });
  expect(screen.getByTestId("dirty").textContent).toBe("true");
  expect(screen.getByTestId("chosen").textContent).toBe("");
  fireEvent.click(screen.getByText(tr("custom.save")));
  await screen.findByText(tr("custom.ready"));
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ recipe: { negativeRules: ["First rule", "Second rule"], reviewRules: ["First rule", "Second rule"] } });
  expect(screen.getByTestId("chosen").textContent).toBe(edited.id);
  expect(screen.getByTestId("dirty").textContent).toBe("false");
  fireEvent.click(screen.getByText(tr("custom.reset")));
  expect(screen.queryByText(tr("custom.save"))).toBeNull();
 });
 it("analyzes an uploaded image and shows editable material rules and actual analysis cost", async () => {
  const bodies: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
   if (url === "/api/styles/custom" && !init) return json([]);
   bodies.push(JSON.parse(String(init?.body)));
   return json({ recipe: RECIPE, referenceKey, costUsd: 0.02, cached: false });
  }));
  renderIn(<Host />);
  upload(file()); fireEvent.click(screen.getByText(tr("custom.analyze")));
  await screen.findByLabelText(tr("custom.field.name"));
  expect(bodies[0]).toMatchObject({ mimeType: "image/png", base64: "AQID" });
  expect(screen.getByText(/Bu analizin maliyeti/).textContent).toContain("0.02");
  expect(screen.getByAltText(tr("custom.reference")).getAttribute("src")).toBe("/api/assets/" + referenceKey);
  expect(screen.getByTestId("dirty").textContent).toBe("true");
  fireEvent.change(screen.getByLabelText(tr("custom.field.craftPreset")), { target: { value: "risograph" } });
  expect((screen.getByLabelText(tr("custom.field.craftPreset")) as HTMLSelectElement).value).toBe("risograph");
 });
 it("uses cached analyses without displaying the original charge as a new charge", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url === "/api/styles/custom" ? json([]) : json({ recipe: RECIPE, referenceKey, costUsd: 0.02, cached: true })));
  renderIn(<Host />); upload(file()); fireEvent.click(screen.getByText(tr("custom.analyze")));
  await screen.findByLabelText(tr("custom.field.name"));
  expect(screen.getByText(/Bu analizin maliyeti/).textContent).toContain("$0 ");
 });
 it("rejects unsupported or oversized files, cancellation clears the draft, and invalid recipe edits never post", async () => {
  const api = vi.fn(async () => json([saved])); vi.stubGlobal("fetch", api);
  renderIn(<Host initial={saved.id} />); await screen.findByLabelText(tr("custom.field.name"));
  upload(new File(["x"], "x.svg", { type: "image/svg+xml" })); expect(screen.getByRole("alert").textContent).toBe(tr("custom.badImage"));
  upload(new File([new Uint8Array(4 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }));
  expect(screen.getByRole("alert")).toBeTruthy();
  upload(new File([], "empty.png", { type: "image/png" }));
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.change(screen.getByLabelText(tr("custom.field.palette")), { target: { value: "red" } });
  fireEvent.click(screen.getByText(tr("custom.save")));
  expect(screen.getByRole("alert").textContent).toBe(tr("custom.invalid"));
  expect(api).toHaveBeenCalledTimes(1);
  upload(undefined); expect(screen.queryByText(tr("custom.save"))).toBeNull();
 });
 it("keeps drafts editable after analysis or save errors and displays useful server messages", async () => {
  let saveFails = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
   if (!init) return json([saved]);
   return json({ error: saveFails ? "save unavailable" : "analysis unavailable" }, 400);
  }));
  renderIn(<Host initial={saved.id} />); await screen.findByLabelText(tr("custom.field.name"));
  saveFails = true; fireEvent.click(screen.getByText(tr("custom.save"))); await screen.findByText("save unavailable");
  upload(file()); saveFails = false; fireEvent.click(screen.getByText(tr("custom.analyze"))); await screen.findByText("analysis unavailable");
 });
 it("shows library/network failures, handles file-read failure, and ignores late results after unmount", async () => {
  let resolve!: (r: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async () => new Promise<Response>((r) => { resolve = r; })));
  const view = renderIn(<Host />); view.unmount();
  await act(async () => resolve(json([saved])));
  vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
  renderIn(<Host />); await screen.findByText(tr("custom.failed")); cleanup();
  vi.stubGlobal("fetch", vi.fn(async () => json([])));
  class BrokenReader { onerror?: () => void; readAsDataURL() { this.onerror?.(); } }
  vi.stubGlobal("FileReader", BrokenReader);
  renderIn(<Host />); upload(file()); fireEvent.click(screen.getByText(tr("custom.analyze"))); await screen.findByText(tr("custom.failed"));
 });
 it("new-episode form passes only the saved style ID and blocks unsaved reference changes", async () => {
  let body: any;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
   if (url === "/api/styles/custom") return json([saved]);
   if (url === "/api/estimate") return json(makeEstimates());
   body = JSON.parse(String(init?.body)); return json({ id: "new-episode" });
  }));
  renderIn(<NewEpisodeForm />);
  fireEvent.change(document.getElementById("stylePack")!, { target: { value: "custom" } });
  await screen.findByRole("option", { name: RECIPE.name });
  fireEvent.change(screen.getByLabelText(tr("custom.saved")), { target: { value: saved.id } });
  fireEvent.change(document.getElementById("topic")!, { target: { value: "Messages" } });
  await act(async () => fireEvent.submit(document.querySelector("form")!));
  expect(body.customStyleId).toBe(saved.id);
  fireEvent.change(screen.getByLabelText(tr("custom.field.name")), { target: { value: "Unsaved" } });
  expect((screen.getByText(tr("custom.unsavedShort")).closest("button") as HTMLButtonElement).disabled).toBe(true);
  body = undefined; await act(async () => fireEvent.submit(document.querySelector("form")!));
  expect(body).toBeUndefined();
 });
});

describe("custom style async boundaries", () => {
 it.each(["save", "analyze"] as const)("%s handles empty error responses and non-Error network failures", async (action) => {
  for (const failure of ["http", "network"] as const) {
   vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init) return json([saved]);
    if (failure === "network") throw "connection lost";
    return json({}, 400);
   }));
   renderIn(<Host initial={saved.id} />); await screen.findByLabelText(tr("custom.field.name"));
   if (action === "analyze") upload(file());
   fireEvent.click(screen.getByText(tr(`custom.${action}`)));
   await screen.findByText(tr("custom.failed"));
   expect(screen.getByTestId("dirty").textContent).toBe(action === "analyze" ? "true" : "false");
   cleanup();
  }
 });
 it.each(["save", "analyze"] as const)("%s ignores success and failure after its editor unmounts", async (action) => {
  for (const fail of [false, true]) {
   let pending: { resolve: (r: Response) => void; reject: (e: Error) => void } | undefined;
   vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init) return json([saved]);
    return new Promise<Response>((resolve, reject) => { pending = { resolve, reject }; });
   }));
   const view = renderIn(<Host initial={saved.id} />); await screen.findByLabelText(tr("custom.field.name"));
   if (action === "analyze") upload(file());
   fireEvent.click(screen.getByText(tr(`custom.${action}`)));
   await waitFor(() => expect(pending).toBeDefined());
   view.unmount();
   await act(async () => {
    if (fail) pending!.reject(new Error("late failure"));
    else pending!.resolve(json(action === "save" ? saved : { recipe: RECIPE, referenceKey, costUsd: 0.02, cached: false }));
   });
   expect(screen.queryByText("late failure")).toBeNull();
  }
 });
});

it("ignores a saved-style library failure after the editor unmounts", async () => {
 let reject!: (e: Error) => void;
 vi.stubGlobal("fetch", vi.fn(async () => new Promise<Response>((_resolve, fail) => { reject = fail; })));
 const view = renderIn(<Host />); view.unmount();
 await act(async () => reject(new Error("late library failure")));
 expect(screen.queryByText("late library failure")).toBeNull();
});

it("starts an editable Paper Poster draft without an image analysis and saves it without an old reference", async () => {
 const requests: { url: string; body: unknown }[] = [];
 vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
  if (!init) return json([saved]);
  const body = JSON.parse(String(init.body)); requests.push({ url, body });
  return json({ ...edited, recipe: body.recipe, referenceKey: body.referenceKey });
 }));
 renderIn(<Host initial={saved.id} />); await screen.findByLabelText(tr("custom.field.name"));
 expect(screen.getByAltText(tr("custom.reference"))).toBeTruthy();
 fireEvent.click(screen.getByRole("button", { name: "Kâğıt Poster ile başla" }));
 expect((screen.getByLabelText(tr("custom.field.name")) as HTMLTextAreaElement).value).toBe("Kâğıt Poster");
 expect((screen.getByLabelText(tr("custom.field.palette")) as HTMLInputElement).value).toBe("#F3F0E6, #111410, #68725F, #D5FA73");
 expect(screen.queryByAltText(tr("custom.reference"))).toBeNull();
 expect(screen.getByTestId("chosen").textContent).toBe("");
 expect(screen.getByTestId("dirty").textContent).toBe("true");
 expect(requests).toHaveLength(0);
 fireEvent.click(screen.getByText(tr("custom.save"))); await screen.findByText(tr("custom.ready"));
 expect(requests).toHaveLength(1);
 expect(requests[0]!.url).toBe("/api/styles/custom");
 expect(requests[0]!.body).not.toHaveProperty("referenceKey");
 expect(requests[0]!.body).toMatchObject({ recipe: { name: "Kâğıt Poster", texture: "paper", lineStyle: "flat" } });
});

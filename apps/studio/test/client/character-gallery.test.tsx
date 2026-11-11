// @vitest-environment happy-dom
import { useState } from "react";
import type { LibraryCharacter } from "@ys/pipeline/light";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CharacterBankPicker } from "../../src/app/character-bank-picker.tsx";
import { en, renderIn, tr } from "./fixtures.tsx";

afterEach(cleanup);
const character = (i: number, extra: Partial<LibraryCharacter> = {}): LibraryCharacter => ({ id: i.toString(16).padStart(32, "0"), key: `library/vector/character/${i.toString(16).padStart(32, "0")}.svg`, name: `Character ${i}`, description: `Appearance ${i}`, role: "presenter", pack: "flat-explainer", artStyle: "flat", lineStyle: "outline", episodes: [], mascotOf: [], ...extra });
function Gallery({ bank, disabled = false, initialPresenter = "", initialCast = [] }: { bank: LibraryCharacter[]; disabled?: boolean; initialPresenter?: string; initialCast?: string[] }) {
  const [presenter, setPresenter] = useState(initialPresenter), [cast, setCast] = useState<string[]>(initialCast);
  return <><CharacterBankPicker bank={bank} presenter={presenter} setPresenter={setPresenter} cast={cast} setCast={setCast} disabled={disabled} /><output data-testid="selection">{JSON.stringify({ presenter, cast })}</output></>;
}
const current = () => JSON.parse(screen.getByTestId("selection").textContent!);
describe("new episode character gallery", () => {
  it("renders twelve thumbnails per page and retains selections through pages, search and clearing filters", () => {
    const bank = Array.from({ length: 25 }, (_, i) => character(i + 1)); renderIn(<Gallery bank={bank} />);
    expect(screen.getAllByRole("article")).toHaveLength(12); expect(screen.getAllByRole("img")).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.asPresenter", { name: "Character 1" }) }));
    fireEvent.click(screen.getByRole("button", { name: tr("quality.next") }));
    expect(screen.queryByRole("article", { name: "Character 1" })).toBeNull();
    expect(screen.getByRole("button", { name: tr("form.bank.removeSelected", { name: "Character 1" }) })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: tr("form.bank.asCast", { name: "Character 13" }) }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Character 25" } });
    expect(screen.getAllByRole("article")).toHaveLength(1); expect(screen.queryByRole("navigation")).toBeNull();
    expect(current()).toEqual({ presenter: bank[0]!.id, cast: [bank[12]!.id] });
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.resetFilters") }));
    expect(screen.getByText(tr("form.bank.page", { page: 1, total: 3 }))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: tr("quality.next") })); fireEvent.click(screen.getByRole("button", { name: tr("quality.next") }));
    expect(screen.getAllByRole("article")).toHaveLength(1); expect((screen.getByRole("button", { name: tr("quality.next") }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("filters by Turkish text, style and line and does not remove choices hidden by filters", () => {
    const bank = [character(1, { name: "Işık", role: "Bilim insanı" }), character(2, { name: "Noir", pack: "noir", lineStyle: "ink" })]; renderIn(<Gallery bank={bank} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "isik" } }); expect(screen.getByRole("article", { name: "Işık" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: tr("form.bank.asCast", { name: "Işık" }) }));
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.resetFilters") }));
    fireEvent.change(screen.getByLabelText(tr("form.bank.packFilter")), { target: { value: "noir" } });
    fireEvent.change(screen.getByLabelText(tr("form.bank.lineFilter")), { target: { value: "ink" } });
    expect(screen.getAllByRole("article")).toHaveLength(1); expect(current().cast).toEqual([bank[0]!.id]);
    fireEvent.click(screen.getByRole("checkbox", { name: tr("form.bank.compatibleOnly") })); expect(within(screen.getByRole("group")).getByRole("status").textContent).toBe(tr("form.bank.noMatches"));
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.removeSelected", { name: "Işık" }) })); expect(screen.getByRole("article", { name: "Noir" })).toBeTruthy();
  });
  it("prevents mixed styles and more than five cast members, and promotes cast to presenter without duplication", () => {
    const bank = [...Array.from({ length: 7 }, (_, i) => character(i + 1)), character(8, { pack: "noir" })]; renderIn(<Gallery bank={bank} />);
    for (let i = 1; i <= 5; i++) fireEvent.click(screen.getByRole("checkbox", { name: tr("form.bank.asCast", { name: `Character ${i}` }) }));
    expect((screen.getByRole("checkbox", { name: tr("form.bank.asCast", { name: "Character 6" }) }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: tr("form.bank.asPresenter", { name: "Character 8" }) }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.asPresenter", { name: "Character 1" }) }));
    expect(current()).toEqual({ presenter: bank[0]!.id, cast: bank.slice(1, 5).map((c) => c.id) });
    fireEvent.click(screen.getByRole("checkbox", { name: tr("form.bank.asCast", { name: "Character 6" }) })); expect(current().cast).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.clear") })); expect(current()).toEqual({ presenter: "", cast: [] });
    expect((screen.getByRole("button", { name: tr("form.bank.asPresenter", { name: "Character 8" }) }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("uses 3D figure previews, falls back to SVG, and shows a placeholder if both fail", () => {
    const c = character(1, { figurePreview: "library/vector/character/figure.png" }); renderIn(<Gallery bank={[c]} />, "en");
    let img = screen.getByRole("img", { name: c.name }); expect(img.getAttribute("src")).toBe("/api/assets/library/vector/character/figure.png");
    fireEvent.error(img); img = screen.getByRole("img", { name: c.name }); expect(img.getAttribute("src")).toBe(`/api/assets/${c.key}`);
    fireEvent.error(img); expect(screen.getByRole("img", { name: en("form.bank.imageMissing", { name: c.name }) })).toBeTruthy();
    expect(screen.getByRole("button", { name: en("form.bank.asPresenter", { name: c.name }) })).toBeTruthy();
  });
  it("keeps explicit roles disabled during submission and provides an empty-bank route", () => {
    const { unmount } = renderIn(<Gallery bank={[character(1)]} disabled />);
    const fieldset = screen.getByRole("group", { name: tr("form.bank.title") }) as HTMLFieldSetElement; expect(fieldset.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.asPresenter", { name: "Character 1" }) })); expect(current().presenter).toBe("");
    unmount(); renderIn(<Gallery bank={[]} />); expect(screen.getByText(tr("bank.empty"))).toBeTruthy();
    expect(within(screen.getByRole("group")).getByRole("link", { name: tr("form.bank.manage") }).getAttribute("href")).toBe("/characters");
  });
  it("removes either role, pages backward and keeps imported mixed/unsupported choices visible", () => {
    const bank = Array.from({ length: 13 }, (_, i) => character(i + 1));
    const view = renderIn(<Gallery bank={bank} />);
    fireEvent.click(screen.getByRole("button", { name: tr("quality.next") })); fireEvent.click(screen.getByRole("button", { name: tr("quality.previous") }));
    expect(screen.getByRole("article", { name: "Character 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.asPresenter", { name: "Character 1" }) }));
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.removePresenter", { name: "Character 1" }) })); expect(current().presenter).toBe("");
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.asPresenter", { name: "Character 1" }) }));
    fireEvent.click(screen.getByRole("button", { name: tr("form.bank.removeSelected", { name: "Character 1" }) })); expect(current().presenter).toBe("");
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole("checkbox", { name: tr("form.bank.asCast", { name: "Character 2" }) }));
    expect(current().cast).toEqual([]); view.unmount();
    const mixed = [character(1), character(2, { pack: "noir", bank: true }), character(3, { pack: undefined, role: "" }), character(4, { pack: "removed-pack" })];
    renderIn(<Gallery bank={mixed} initialPresenter={mixed[0]!.id} initialCast={[mixed[1]!.id]} />);
    expect(screen.getByRole("alert").textContent).toBe(tr("form.bank.mixed")); expect(screen.getAllByText(tr("bank.custom"), { exact: false }).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: tr("form.bank.asPresenter", { name: "Character 3" }) }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.error(screen.getByRole("img", { name: "Character 3" })); expect(screen.getByRole("img", { name: tr("form.bank.imageMissing", { name: "Character 3" }) })).toBeTruthy();
  });
});

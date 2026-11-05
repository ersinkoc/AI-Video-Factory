// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { DeleteEpisode } from "../../src/app/delete-episode.tsx";
import { renderIn } from "./fixtures.tsx";

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

const ask = () => fireEvent.click(screen.getByRole("button", { name: "Bölümü sil" }));
const confirm = async () => {
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Sil" })));
};

describe("DeleteEpisode", () => {
  it("önce sorar; vazgeçilirse hiçbir şey gönderilmez", () => {
    renderIn(<DeleteEpisode id="e1" title="Fatih" running={false} />);
    ask();
    expect(screen.getByRole("alertdialog").textContent).toContain("Fatih silinsin mi?");
    fireEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("onaylanınca JSON DELETE gönderir ve listeyi yeniler", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    renderIn(<DeleteEpisode id="e1" title="Fatih" running={false} />);
    ask();
    await confirm();
    expect(fetchMock).toHaveBeenCalledWith("/api/episodes/e1", { method: "DELETE", headers: { "content-type": "application/json" }, body: "{}" });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("sunucunun hatası, gövdesiz hata ve ağ hatası onay kutusunda gösterilir", async () => {
    renderIn(<DeleteEpisode id="e1" title="Fatih" running={false} />, "en");
    fireEvent.click(screen.getByRole("button", { name: "Delete episode" }));
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Wait for the running job to finish first" }, { status: 409 }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Delete" })));
    expect(screen.getByRole("alertdialog").textContent).toContain("Wait for the running job to finish first");
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 500 }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Delete" })));
    expect(screen.getByRole("alertdialog").textContent).toContain("Action failed");
    fetchMock.mockRejectedValueOnce(new Error("ağ"));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Delete" })));
    expect(screen.getByRole("alertdialog").textContent).toContain("Action failed");
    expect(router.refresh).not.toHaveBeenCalled();
    // Vazgeçip yeniden açınca eski hata görünmez.
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete episode" }));
    expect(screen.getByRole("alertdialog").textContent).not.toContain("Action failed");
  });

  it("iş sürerken düğme kapalı ve nedenini söyler", () => {
    renderIn(<DeleteEpisode id="e1" title="Fatih" running />);
    const button = screen.getByRole("button", { name: "Bölümü sil" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("İş sürerken silinemez; önce durdur.");
  });
});

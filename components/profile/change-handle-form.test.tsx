import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// Mock only the boundaries: the server actions (the component's job is the
// debounced availability UI + save/cancel flow, not the action internals) and
// the router (refresh is the observable post-save effect).
const { checkHandleAction, changeHandleAction, generateHandleAction } = vi.hoisted(() => ({
  checkHandleAction: vi.fn(),
  changeHandleAction: vi.fn(),
  generateHandleAction: vi.fn(),
}));
vi.mock("@/app/actions/onboarding", () => ({ checkHandleAction, changeHandleAction, generateHandleAction }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ChangeHandleForm } from "@/components/profile/change-handle-form";

const openEditor = () => fireEvent.click(screen.getByRole("button", { name: "ערכו כינוי" }));
const input = () => screen.getByRole("textbox", { name: "כינוי חדש" }) as HTMLInputElement;
const typeHandle = (value: string) => fireEvent.change(input(), { target: { value } });
const saveBtn = () => screen.getByRole("button", { name: "שמרו" }) as HTMLButtonElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChangeHandleForm", () => {
  it("is collapsed by default and opens an editor prefilled with the current handle", () => {
    render(<ChangeHandleForm currentHandle="gal" />);

    expect(screen.queryByRole("textbox")).toBeNull();
    openEditor();

    expect(input().value).toBe("gal");
    expect(saveBtn().disabled).toBe(true); // unchanged
  });

  it("shows the handle as free and enables save when an available handle is typed", async () => {
    checkHandleAction.mockResolvedValue({ available: true });
    render(<ChangeHandleForm currentHandle="gal" />);
    openEditor();
    typeHandle("newhandle");

    expect(await screen.findByText(/פנוי/)).toBeTruthy();
    expect(saveBtn().disabled).toBe(false);
  });

  it("reports a taken handle and keeps save disabled", async () => {
    checkHandleAction.mockResolvedValue({ available: false, reason: "taken" });
    render(<ChangeHandleForm currentHandle="gal" />);
    openEditor();
    typeHandle("takenone");

    expect(await screen.findByText(/תפוס/)).toBeTruthy();
    expect(saveBtn().disabled).toBe(true);
    expect(changeHandleAction).not.toHaveBeenCalled();
  });

  it("flags an invalid format without calling the availability check", async () => {
    render(<ChangeHandleForm currentHandle="gal" />);
    openEditor();
    typeHandle("ab"); // too short

    expect(await screen.findByText(/3–20/)).toBeTruthy();
    expect(checkHandleAction).not.toHaveBeenCalled();
  });

  it("saves a valid new handle, then collapses and refreshes the route", async () => {
    checkHandleAction.mockResolvedValue({ available: true });
    changeHandleAction.mockResolvedValue({ ok: true, handle: "newhandle" });
    render(<ChangeHandleForm currentHandle="gal" />);
    openEditor();
    typeHandle("newhandle");
    await screen.findByText(/פנוי/);
    fireEvent.click(saveBtn());

    expect(await screen.findByRole("button", { name: "ערכו כינוי" })).toBeTruthy();
    expect(changeHandleAction).toHaveBeenCalledWith({ handle: "newhandle" });
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces the server error message and stays in the editor on failure", async () => {
    checkHandleAction.mockResolvedValue({ available: true });
    changeHandleAction.mockResolvedValue({ ok: false, message: "הכינוי תפוס — בחרו אחר" });
    render(<ChangeHandleForm currentHandle="gal" />);
    openEditor();
    typeHandle("newhandle");
    await screen.findByText(/פנוי/);
    fireEvent.click(saveBtn());

    expect(await screen.findByText("הכינוי תפוס — בחרו אחר")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "כינוי חדש" })).toBeTruthy(); // still editing
  });
});

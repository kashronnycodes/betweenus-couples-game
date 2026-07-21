// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerStatusIndicator } from "./PlayerStatusIndicator";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PlayerStatusIndicator", () => {
  it("cycles calm text dots without changing its accessible announcement", () => {
    vi.useFakeTimers();
    const { container } = render(<PlayerStatusIndicator status="thinking" />);
    expect(screen.getByText("Waiting for answer.")).toBeTruthy();
    expect(container.querySelector(".thinking-dots")?.textContent).toBe(".");
    act(() => vi.advanceTimersByTime(350));
    expect(container.querySelector(".thinking-dots")?.textContent).toBe("..");
    act(() => vi.advanceTimersByTime(350));
    expect(container.querySelector(".thinking-dots")?.textContent).toBe("...");
    act(() => vi.advanceTimersByTime(350));
    expect(container.querySelector(".thinking-dots")?.textContent).toBe(".");
  });

  it("shows the monochrome check only for server-confirmed submission", async () => {
    const { container, rerender } = render(<PlayerStatusIndicator status="thinking" />);
    expect(container.querySelector("svg")).toBeNull();
    rerender(<PlayerStatusIndicator status="submitted" />);
    expect(screen.getByText("Answer locked.")).toBeTruthy();
    await waitFor(() => expect(container.querySelector("svg")).toBeTruthy());
    expect(container.querySelector(".player-round-status")?.className).toContain("player-round-status");
  });
});

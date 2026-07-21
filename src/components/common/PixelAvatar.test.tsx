// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AVATARS } from "../../constants/avatars";
import { PixelAvatar } from "./PixelAvatar";

afterEach(cleanup);

describe("PixelAvatar", () => {
  it("defines every optimized source and valid fallback", () => {
    for (const avatar of AVATARS) {
      expect(avatar.fallback).toBe(`/avatars/generated/${avatar.id}-192.png`);
      expect(Object.keys(avatar.sources)).toEqual(["96", "192", "384"]);
      expect(Object.values(avatar.sources).every((url) => url.startsWith(`/avatars/generated/${avatar.id}-`))).toBe(true);
    }
  });

  it("shows a reserved placeholder until the optimized image loads", () => {
    const { container } = render(<PixelAvatar avatarId="male" alt="Male" size="small" priority />);
    expect(screen.getByTestId("avatar-placeholder")).toBeTruthy();
    expect(container.querySelector(".pixel-avatar--small")).toBeTruthy();
    const image = screen.getByAltText("Male");
    expect(image.getAttribute("width")).toBe("192");
    expect(image.getAttribute("height")).toBe("288");
    fireEvent.load(image);
    expect(screen.queryByTestId("avatar-placeholder")).toBeNull();
    expect(container.querySelector('[data-state="loaded"]')).toBeTruthy();
  });

  it("uses a neutral silhouette instead of a broken image", () => {
    render(<PixelAvatar avatarId="female" alt="Female" size="medium" />);
    fireEvent.error(screen.getByAltText("Female"));
    expect(screen.getByTestId("avatar-fallback")).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Female" })).toBeTruthy();
  });

  it("maps priority to eager/high and ordinary images to lazy/auto", () => {
    const { rerender } = render(<PixelAvatar avatarId="male" alt="Avatar" size="large" priority />);
    let image = screen.getByAltText("Avatar");
    expect(image.getAttribute("loading")).toBe("eager");
    expect(image.getAttribute("fetchpriority")).toBe("high");
    rerender(<PixelAvatar avatarId="female" alt="Avatar" size="large" />);
    image = screen.getByAltText("Avatar");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("fetchpriority")).toBe("auto");
  });
});

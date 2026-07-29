import { describe, it, expect, beforeEach, vi } from "vitest";

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
}

let pendingImages: MockImage[] = [];

describe("assets", () => {
  beforeEach(() => {
    pendingImages = [];
    vi.stubGlobal("Image", function () {
      const img = new MockImage();
      pendingImages.push(img);
      return img;
    });
    vi.resetModules();
  });

  it("FALLBACK_COLORS 包含所有坦克颜色", async () => {
    const { FALLBACK_COLORS } = await import("../../src/game/assets");
    expect(FALLBACK_COLORS.red).toBeDefined();
    expect(FALLBACK_COLORS.blue).toBeDefined();
    expect(FALLBACK_COLORS.green).toBeDefined();
    expect(FALLBACK_COLORS.yellow).toBeDefined();
  });

  it("成功加载素材后 getAsset 返回图片", async () => {
    const { loadAssets, getAsset } = await import("../../src/game/assets");
    const promise = loadAssets();
    await new Promise((r) => setTimeout(r, 10));
    pendingImages.forEach((img) => img.onload?.());
    await promise;
    expect(getAsset("tank_red")).not.toBeNull();
  });

  it("加载失败时记录到 getFailedAssets", async () => {
    const { loadAssets, getFailedAssets } = await import("../../src/game/assets");
    const promise = loadAssets();
    await new Promise((r) => setTimeout(r, 10));
    pendingImages.forEach((img) => img.onerror?.());
    await promise;
    expect(getFailedAssets().length).toBeGreaterThan(0);
  });
});

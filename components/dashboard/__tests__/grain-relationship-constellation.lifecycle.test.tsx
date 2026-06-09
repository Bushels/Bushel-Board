import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GrainRelationshipConstellation } from "@/components/dashboard/grain-relationship-constellation";
import { buildGrainRelationshipOverview } from "@/lib/thesis/grain-impact-graph";
import { SUPPORTED_RATING_GRAINS } from "@/lib/thesis/rating-model";

const lifecycle = vi.hoisted(() => ({
  resourceCreateCount: 0,
  resourceDisposeCount: 0,
  rendererDisposeCount: 0,
  rendererCreateCount: 0,
  reset() {
    this.resourceCreateCount = 0;
    this.resourceDisposeCount = 0;
    this.rendererDisposeCount = 0;
    this.rendererCreateCount = 0;
  },
}));

vi.mock("three", () => {
  class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copy(v: Vector3) {
      return this.set(v.x, v.y, v.z);
    }
    clone() {
      return new Vector3(this.x, this.y, this.z);
    }
    sub(v: Vector3) {
      return this.set(this.x - v.x, this.y - v.y, this.z - v.z);
    }
    subVectors(a: Vector3, b: Vector3) {
      return this.set(a.x - b.x, a.y - b.y, a.z - b.z);
    }
    multiplyScalar(s: number) {
      return this.set(this.x * s, this.y * s, this.z * s);
    }
    normalize() {
      return this;
    }
    lerp() {
      return this;
    }
  }

  class Disposable {
    constructor() {
      lifecycle.resourceCreateCount += 1;
    }
    dispose() {
      lifecycle.resourceDisposeCount += 1;
    }
  }

  class BufferGeometry extends Disposable {
    setFromPoints() {
      return this;
    }
  }

  class Object3DStub {
    position = new Vector3();
    scale = new Vector3();
    rotation = { x: 0, y: 0, z: 0 };
    quaternion = { setFromUnitVectors: () => undefined };
    userData: Record<string, unknown> = {};
    children: unknown[] = [];
    add(...items: unknown[]) {
      this.children.push(...items);
      return this;
    }
    lookAt() {
      return this;
    }
  }

  class WebGLRenderer {
    domElement = typeof document === "undefined" ? null : document.createElement("canvas");
    constructor() {
      lifecycle.rendererCreateCount += 1;
    }
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    render() {}
    dispose() {
      lifecycle.rendererDisposeCount += 1;
    }
  }

  class CanvasTexture extends Disposable {
    needsUpdate = false;
  }

  class PerspectiveCamera extends Object3DStub {
    aspect = 1;
    updateProjectionMatrix() {}
  }

  return {
    Vector3,
    Vector2: class {
      x = 0;
      y = 0;
    },
    Scene: class extends Object3DStub {},
    Group: class extends Object3DStub {},
    GridHelper: class extends Object3DStub {},
    PerspectiveCamera,
    WebGLRenderer,
    AmbientLight: class extends Object3DStub {},
    DirectionalLight: class extends Object3DStub {},
    BufferGeometry,
    SphereGeometry: class extends Disposable {},
    ConeGeometry: class extends Disposable {},
    LineBasicMaterial: class extends Disposable {},
    MeshStandardMaterial: class extends Disposable {},
    MeshBasicMaterial: class extends Disposable {
      colorWrite = true;
    },
    SpriteMaterial: class extends Disposable {},
    CanvasTexture,
    Line: class extends Object3DStub {},
    Mesh: class extends Object3DStub {},
    Sprite: class extends Object3DStub {},
    Raycaster: class {
      setFromCamera() {}
      intersectObjects() {
        return [];
      }
    },
  };
});

class ResizeObserverStub {
  static instances: ResizeObserverStub[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  constructor() {
    ResizeObserverStub.instances.push(this);
  }
}

const originalUserAgent = navigator.userAgent;
const originalGetContext = HTMLCanvasElement.prototype.getContext;
const originalResizeObserver = globalThis.ResizeObserver;
const originalMatchMedia = window.matchMedia;
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

describe("GrainRelationshipConstellation Three.js lifecycle", () => {
  const requestAnimationFrameSpy = vi.fn(() => 42);
  const cancelAnimationFrameSpy = vi.fn();

  beforeEach(() => {
    lifecycle.reset();
    ResizeObserverStub.instances = [];
    requestAnimationFrameSpy.mockClear();
    cancelAnimationFrameSpy.mockClear();

    Object.defineProperty(window.navigator, "userAgent", {
      value: "BushelBoardLifecycleTest/1.0",
      configurable: true,
    });
    HTMLCanvasElement.prototype.getContext = function getContext(type: string) {
      if (type === "webgl2" || type === "webgl") return {} as never;
      return null;
    } as typeof HTMLCanvasElement.prototype.getContext;
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
    window.matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    window.requestAnimationFrame = requestAnimationFrameSpy as unknown as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = cancelAnimationFrameSpy as unknown as typeof window.cancelAnimationFrame;
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    globalThis.ResizeObserver = originalResizeObserver;
    window.matchMedia = originalMatchMedia;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  it("boots the Three.js scene, then cancels the frame loop and disposes every resource on unmount", async () => {
    const { unmount } = render(
      <GrainRelationshipConstellation overview={buildGrainRelationshipOverview(SUPPORTED_RATING_GRAINS)} />,
    );

    await waitFor(() => {
      expect(lifecycle.rendererCreateCount).toBe(1);
      expect(requestAnimationFrameSpy).toHaveBeenCalled();
    });

    expect(ResizeObserverStub.instances).toHaveLength(1);
    expect(ResizeObserverStub.instances[0].observe).toHaveBeenCalledTimes(1);
    expect(lifecycle.resourceDisposeCount).toBe(0);
    expect(lifecycle.rendererDisposeCount).toBe(0);

    unmount();

    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(42);
    expect(ResizeObserverStub.instances[0].disconnect).toHaveBeenCalledTimes(1);
    expect(lifecycle.rendererDisposeCount).toBe(1);
    // Every geometry, material, and texture created during boot must be disposed on unmount.
    expect(lifecycle.resourceCreateCount).toBeGreaterThan(0);
    expect(lifecycle.resourceDisposeCount).toBe(lifecycle.resourceCreateCount);
  });
});

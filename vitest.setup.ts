import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock matchMedia for jsdom
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Notification API
if (!window.Notification) {
  Object.defineProperty(window, "Notification", {
    value: vi.fn(),
  });
  // @ts-ignore
  window.Notification.requestPermission = vi.fn().mockResolvedValue("granted");
}

// Mock Supabase
vi.mock("@/lib/supabase", () => ({
  supabase: null,
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}));

// Setup default IntersectionObserver
class IntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}

Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  configurable: true,
  value: IntersectionObserver,
});

// Reset stores between tests if needed (can be handled per test)

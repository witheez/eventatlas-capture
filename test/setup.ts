/**
 * Vitest setup file - Chrome API mocks
 */
import { vi } from 'vitest';

// Mock storage data
const mockStorage: Record<string, unknown> = {};

// Chrome Storage API mock
const storageMock = {
  local: {
    get: vi.fn((keys: string | string[]) => {
      return new Promise((resolve) => {
        const result: Record<string, unknown> = {};
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach((key) => {
          if (mockStorage[key] !== undefined) {
            result[key] = mockStorage[key];
          }
        });
        resolve(result);
      });
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      return new Promise<void>((resolve) => {
        Object.assign(mockStorage, items);
        resolve();
      });
    }),
    remove: vi.fn((keys: string | string[]) => {
      return new Promise<void>((resolve) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        keyArray.forEach((key) => {
          delete mockStorage[key];
        });
        resolve();
      });
    }),
    clear: vi.fn(() => {
      return new Promise<void>((resolve) => {
        Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
        resolve();
      });
    }),
  },
  sync: {
    get: vi.fn(() => Promise.resolve({})),
    set: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  },
};

// Chrome Tabs API mock
const tabsMock = {
  query: vi.fn(() => Promise.resolve([])),
  get: vi.fn((tabId: number) => Promise.resolve({ id: tabId, url: 'https://example.com' })),
  create: vi.fn(() => Promise.resolve({ id: 1 })),
  update: vi.fn(() => Promise.resolve({})),
  remove: vi.fn(() => Promise.resolve()),
  sendMessage: vi.fn(() => Promise.resolve()),
};

// Chrome Runtime API mock
const runtimeMock = {
  sendMessage: vi.fn(() => Promise.resolve()),
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
    hasListener: vi.fn(() => false),
  },
  getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
  lastError: null,
};

// Chrome SidePanel API mock
const sidePanelMock = {
  open: vi.fn(() => Promise.resolve()),
  setOptions: vi.fn(() => Promise.resolve()),
  setPanelBehavior: vi.fn(() => Promise.resolve()),
};

// Chrome Action API mock
const actionMock = {
  setBadgeText: vi.fn(() => Promise.resolve()),
  setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
  setIcon: vi.fn(() => Promise.resolve()),
};

// Assign to global chrome object
const chromeMock = {
  storage: storageMock,
  tabs: tabsMock,
  runtime: runtimeMock,
  sidePanel: sidePanelMock,
  action: actionMock,
};

// Assign to global
(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

// Export for use in tests
export { mockStorage, chromeMock };

// Helper to clear mock storage between tests
export function clearMockStorage(): void {
  Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
}

// Helper to reset all mocks
export function resetAllMocks(): void {
  clearMockStorage();
  vi.clearAllMocks();
}

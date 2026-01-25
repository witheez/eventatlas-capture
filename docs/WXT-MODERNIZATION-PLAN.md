# WXT Modernization Plan

A phased approach to modernizing the EventAtlas Capture extension using WXT framework.

## Current State

- Vanilla JavaScript with ES modules
- Manual module system (11 JS files + CSS)
- No build process
- No TypeScript
- No automated tests
- Chrome-only (MV3)

## Target State

- WXT framework for modern DX
- TypeScript for type safety
- Vite-powered build with HMR
- Unit tests for business logic
- Cross-browser compatibility (Chrome, Firefox, Edge)

---

## Phase 1: WXT Foundation

**Goal:** Get the extension running on WXT with minimal code changes.

- [ ] Create new git branch for migration
- [ ] Initialize WXT project alongside existing code
- [ ] Set up WXT configuration (manifest, icons, permissions)
- [ ] Move sidepanel to WXT entrypoints structure
- [ ] Move background script to WXT entrypoints
- [ ] Move content script to WXT entrypoints
- [ ] Verify extension loads and basic functionality works
- [ ] Merge to main when stable

**Success criteria:** Extension works identically to before, but built with WXT.

---

## Phase 2: TypeScript Conversion

**Goal:** Add type safety to catch bugs at compile time.

- [ ] Enable TypeScript in WXT config
- [ ] Convert utility modules to TypeScript first (lowest risk)
- [ ] Add types for Chrome extension APIs
- [ ] Convert API and storage modules
- [ ] Convert UI modules one by one
- [ ] Convert main sidepanel entry point
- [ ] Fix all type errors
- [ ] Enable strict mode

**Success criteria:** All files are `.ts`, no `any` types, strict mode enabled.

---

## Phase 3: Testing Infrastructure

**Goal:** Prevent regressions with automated tests.

- [ ] Set up Vitest for unit testing
- [ ] Mock Chrome extension APIs
- [ ] Write tests for utility functions
- [ ] Write tests for API functions
- [ ] Write tests for storage functions
- [ ] Write tests for business logic (capture, bundles, etc.)
- [ ] Set up CI to run tests on PR
- [ ] Aim for >70% coverage on business logic

**Success criteria:** Core business logic has test coverage, CI blocks broken PRs.

---

## Phase 4: State Management

**Goal:** Clean up global state into a proper store pattern.

- [ ] Evaluate state management options (Zustand, vanilla store, etc.)
- [ ] Define clear state interfaces
- [ ] Centralize bundle state
- [ ] Centralize settings state
- [ ] Centralize UI state (current view, selections, etc.)
- [ ] Remove global variables from modules
- [ ] Modules receive state via dependency injection or store subscription

**Success criteria:** No scattered global state, clear data flow, easier to reason about.

---

## Phase 5: UI Framework (Optional)

**Goal:** Component-based UI for maintainability.

- [ ] Evaluate framework options (Preact, Lit, Svelte)
- [ ] Choose framework based on bundle size and learning curve
- [ ] Set up framework in WXT
- [ ] Convert one simple component as proof of concept
- [ ] Gradually convert UI sections to components
- [ ] Implement proper component communication
- [ ] Remove manual DOM manipulation

**Success criteria:** UI is component-based, easier to modify and extend.

---

## Phase 6: Cross-Browser Support

**Goal:** Support Firefox and Edge in addition to Chrome.

- [ ] Review browser API differences
- [ ] Use WXT's browser polyfills
- [ ] Test on Firefox
- [ ] Test on Edge
- [ ] Fix any browser-specific issues
- [ ] Set up builds for each browser

**Success criteria:** Single codebase builds for Chrome, Firefox, and Edge.

---

## Phase 7: Developer Experience

**Goal:** Make development fast and pleasant.

- [ ] Document development setup
- [ ] Add ESLint with strict rules
- [ ] Add Prettier for formatting
- [ ] Set up pre-commit hooks
- [ ] Add VS Code recommended extensions
- [ ] Create contribution guidelines

**Success criteria:** New developers can get started quickly, code quality is enforced.

---

## Notes

- Each phase can be done incrementally over multiple sessions
- Always work on a branch and test before merging
- The extension should remain functional after each phase
- Phases 5 and 6 are optional and can be skipped or deferred
- Prioritize phases 1-3 for immediate value

## Resources

- [WXT Documentation](https://wxt.dev/)
- [WXT GitHub](https://github.com/wxt-dev/wxt)
- [Chrome Extension TypeScript Types](https://www.npmjs.com/package/@anthropics/anthropic-sdk)
- [Vitest](https://vitest.dev/)

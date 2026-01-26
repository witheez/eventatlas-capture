# Autonomous WXT Migration Checklist

This document provides **objectively verifiable** completion criteria for each phase. An orchestrator agent should use these checks to verify sub-agents have actually completed their work.

---

## Configuration

| Setting | Value |
|---------|-------|
| UI Framework | **Preact + TypeScript** (.tsx files) |
| Test Coverage | **85% minimum** |
| Cross-Browser | **SKIP** (Chrome-only) |
| Simplicity Review | **Required after each phase** |

---

## Orchestrator Instructions

For each phase:
1. Spawn a sub-agent to complete the phase
2. When sub-agent reports completion, run ALL verification commands
3. **Run Code Simplifier** on changed files (see `docs/code-simplifier-prompt.md`)
4. If ANY check fails OR simplifier flags issues → send sub-agent back with specific failures
5. Only proceed to next phase when ALL checks pass AND code is simplified
6. After all phases, run the final integration verification

**Trust but verify.** Sub-agents may claim completion prematurely. Always run the checks.

---

## Phase Workflow (Repeat for Each Phase)

```
┌─────────────────────────────────────┐
│  1. Spawn sub-agent for phase       │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  2. Sub-agent reports completion    │
└──────────────┬──────────────────────┘
               ▼
┌─────────────────────────────────────┐
│  3. Run verification script         │
│     (objective checks)              │
└──────────────┬──────────────────────┘
               ▼
       ┌───────┴───────┐
       │  Checks pass? │
       └───────┬───────┘
          NO   │   YES
          ▼    │    ▼
    ┌─────────┐│┌─────────────────────┐
    │ Send    │││ 4. Run Code         │
    │ back    │││    Simplifier       │
    │ with    │││    (opus model)     │
    │ errors  │││                     │
    └────┬────┘│└──────────┬──────────┘
         │     │           ▼
         │     │   ┌───────┴───────┐
         │     │   │ Changes made? │
         │     │   └───────┬───────┘
         │     │      YES  │   NO
         │     │       ▼   │    ▼
         │     │  ┌───────┐│┌─────────────────┐
         │     │  │Re-run ││││ 5. Commit phase │
         │     │  │verify │││└────────┬────────┘
         │     │  └───┬───┘│          │
         │     │      │    │          ▼
         └─────┴──────┴────┴─► Next Phase
```

---

## Phase 2: TypeScript Conversion

### Completion Criteria

| Check | Command | Expected Result |
|-------|---------|-----------------|
| No JS in entrypoints | `find entrypoints -name "*.js" \| wc -l` | `0` |
| No JS in utils | `find utils -name "*.js" \| wc -l` | `0` |
| tsconfig exists | `test -f tsconfig.json && echo "exists"` | `exists` |
| Strict mode enabled | `grep -q '"strict": true' tsconfig.json && echo "enabled"` | `enabled` |
| Build succeeds | `npm run build 2>&1 \| tail -1` | No errors |
| No `any` types | `grep -r ": any" entrypoints utils --include="*.ts" \| wc -l` | `0` |
| No implicit any | `grep -r "noImplicitAny" tsconfig.json` | `"noImplicitAny": true` |
| Chrome types installed | `grep -E "@anthropic\|chrome-types\|@anthropic-ai" package.json \|\| test -d types` | Found |

### Verification Script
```bash
#!/bin/bash
echo "=== Phase 2 Verification ==="
FAIL=0

# No JS files
JS_COUNT=$(find entrypoints utils -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
if [ "$JS_COUNT" != "0" ]; then
  echo "FAIL: Found $JS_COUNT .js files"
  find entrypoints utils -name "*.js"
  FAIL=1
else
  echo "PASS: No .js files"
fi

# tsconfig exists with strict
if [ -f tsconfig.json ]; then
  echo "PASS: tsconfig.json exists"
  if grep -q '"strict": true' tsconfig.json; then
    echo "PASS: strict mode enabled"
  else
    echo "FAIL: strict mode not enabled"
    FAIL=1
  fi
else
  echo "FAIL: tsconfig.json missing"
  FAIL=1
fi

# Build succeeds
npm run build > /tmp/build.log 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Build succeeds"
else
  echo "FAIL: Build failed"
  tail -20 /tmp/build.log
  FAIL=1
fi

# No any types (allowing some exceptions)
ANY_COUNT=$(grep -r ": any" entrypoints utils --include="*.ts" 2>/dev/null | grep -v "// eslint-disable" | wc -l | tr -d ' ')
if [ "$ANY_COUNT" != "0" ]; then
  echo "FAIL: Found $ANY_COUNT 'any' types"
  grep -r ": any" entrypoints utils --include="*.ts" | grep -v "// eslint-disable"
  FAIL=1
else
  echo "PASS: No 'any' types"
fi

exit $FAIL
```

---

## Phase 3: Testing Infrastructure

### Completion Criteria

| Check | Command | Expected Result |
|-------|---------|-----------------|
| Vitest installed | `grep "vitest" package.json` | Found |
| Test script exists | `npm run test --help 2>&1 \| grep -v "missing script"` | No error |
| Test config exists | `test -f vitest.config.ts && echo "exists"` | `exists` |
| Tests pass | `npm run test 2>&1 \| grep -E "(PASS\|passed)"` | Tests passed |
| Utils tests exist | `find . -path "./node_modules" -prune -o -name "*.test.ts" -print \| grep -i util` | Files found |
| API tests exist | `find . -path "./node_modules" -prune -o -name "*.test.ts" -print \| grep -i api` | Files found |
| Storage tests exist | `find . -path "./node_modules" -prune -o -name "*.test.ts" -print \| grep -i storage` | Files found |
| Coverage >= 85% | `npm run test:coverage 2>&1 \| grep "All files"` | >= 85% |
| Chrome mocks exist | `grep -r "vi.mock.*chrome" --include="*.ts" \| head -1` | Found |

### Verification Script
```bash
#!/bin/bash
echo "=== Phase 3 Verification ==="
FAIL=0

# Vitest installed
if grep -q "vitest" package.json; then
  echo "PASS: Vitest installed"
else
  echo "FAIL: Vitest not in package.json"
  FAIL=1
fi

# Test config exists
if [ -f vitest.config.ts ] || [ -f vitest.config.js ]; then
  echo "PASS: Vitest config exists"
else
  echo "FAIL: No vitest config"
  FAIL=1
fi

# Test files exist (need at least 5)
TEST_COUNT=$(find . -path "./node_modules" -prune -o -name "*.test.ts" -print 2>/dev/null | grep -c "\.test\.ts" || echo "0")
if [ "$TEST_COUNT" -ge "5" ]; then
  echo "PASS: Found $TEST_COUNT test files"
else
  echo "FAIL: Only $TEST_COUNT test files (need at least 5)"
  FAIL=1
fi

# Tests pass
npm run test > /tmp/test.log 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Tests pass"
else
  echo "FAIL: Tests failed"
  tail -30 /tmp/test.log
  FAIL=1
fi

# Coverage check - must be >= 85%
npm run test:coverage > /tmp/coverage.log 2>&1
if [ $? -eq 0 ]; then
  COVERAGE=$(grep "All files" /tmp/coverage.log | awk '{print $4}' | tr -d '%' | cut -d'.' -f1)
  if [ -n "$COVERAGE" ] && [ "$COVERAGE" -ge "85" ]; then
    echo "PASS: Coverage at ${COVERAGE}%"
  else
    echo "FAIL: Coverage only ${COVERAGE}% (need 85%)"
    cat /tmp/coverage.log
    FAIL=1
  fi
else
  echo "FAIL: Coverage command failed"
  FAIL=1
fi

exit $FAIL
```

---

## Phase 4: State Management

### Completion Criteria

| Check | Command | Expected Result |
|-------|---------|-----------------|
| Store file exists | `find entrypoints -name "store.ts" -o -name "state.ts" \| grep -v node_modules` | File found |
| Store package OR custom | `grep -E "zustand\|jotai\|nanostores" package.json \|\| test -f entrypoints/sidepanel/store.ts` | Found |
| No module-level let | `grep -rn "^let \|^var " entrypoints --include="*.ts" \| grep -v store \| grep -v test \| wc -l` | `0` or minimal |
| No scattered state | `grep -rn "^let settings\|^let bundles\|^let cache" entrypoints --include="*.ts" \| wc -l` | `0` |
| State imported from store | `grep -r "from.*store" entrypoints --include="*.ts" \| wc -l` | >5 imports |
| No direct chrome.storage in modules | `grep -r "chrome.storage" entrypoints/sidepanel --include="*.ts" \| grep -v store \| wc -l` | `0` |

### Verification Script
```bash
#!/bin/bash
echo "=== Phase 4 Verification ==="
FAIL=0

# Store exists
STORE=$(find entrypoints -name "store.ts" -o -name "state.ts" 2>/dev/null | head -1)
if [ -n "$STORE" ]; then
  echo "PASS: Store file found: $STORE"
else
  echo "FAIL: No store.ts or state.ts found"
  FAIL=1
fi

# No scattered state variables
SCATTERED=$(grep -rn "^let settings\|^let bundles\|^let eventListCache\|^let filterState" entrypoints --include="*.ts" 2>/dev/null | grep -v store | wc -l | tr -d ' ')
if [ "$SCATTERED" = "0" ]; then
  echo "PASS: No scattered state variables"
else
  echo "FAIL: Found $SCATTERED scattered state declarations"
  grep -rn "^let settings\|^let bundles\|^let eventListCache" entrypoints --include="*.ts" | grep -v store
  FAIL=1
fi

# State accessed through store
STORE_IMPORTS=$(grep -r "from.*store" entrypoints --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
if [ "$STORE_IMPORTS" -gt "3" ]; then
  echo "PASS: $STORE_IMPORTS store imports found"
else
  echo "FAIL: Only $STORE_IMPORTS store imports (modules not using store)"
  FAIL=1
fi

# Build still works
npm run build > /tmp/build.log 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Build succeeds"
else
  echo "FAIL: Build failed after state refactor"
  FAIL=1
fi

# Tests still pass
npm run test > /tmp/test.log 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Tests still pass"
else
  echo "FAIL: Tests failed after state refactor"
  FAIL=1
fi

exit $FAIL
```

---

## Phase 5: UI Framework (Preact + TypeScript)

### Completion Criteria

| Check | Command | Expected Result |
|-------|---------|-----------------|
| Preact installed | `grep "preact" package.json` | Found |
| Components dir exists | `test -d entrypoints/sidepanel/components && echo "exists"` | `exists` |
| TSX files exist | `find entrypoints -name "*.tsx" \| wc -l` | >= 5 |
| No innerHTML assignments | `grep -r "\.innerHTML\s*=" entrypoints --include="*.ts" --include="*.tsx" \| wc -l` | `0` |
| No document.createElement | `grep -r "document.createElement" entrypoints --include="*.ts" --include="*.tsx" \| wc -l` | `0` |
| All components typed | `grep -r "Props" entrypoints/sidepanel/components --include="*.tsx" \| wc -l` | >= component count |
| Build succeeds | `npm run build` | No errors |
| Tests pass | `npm run test` | No errors |

### Verification Script
```bash
#!/bin/bash
echo "=== Phase 5 Verification ==="
FAIL=0

# Preact in package.json
if grep -q "preact" package.json; then
  echo "PASS: Preact installed"
else
  echo "FAIL: Preact not in package.json"
  FAIL=1
fi

# Components directory
if [ -d entrypoints/sidepanel/components ]; then
  echo "PASS: Components directory exists"
  COMP_COUNT=$(find entrypoints/sidepanel/components -name "*.tsx" | wc -l | tr -d ' ')
  echo "INFO: Found $COMP_COUNT component files"
else
  echo "FAIL: No components directory"
  FAIL=1
fi

# TSX files exist
TSX_COUNT=$(find entrypoints -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
if [ "$TSX_COUNT" -ge "5" ]; then
  echo "PASS: Found $TSX_COUNT .tsx files"
else
  echo "FAIL: Only $TSX_COUNT .tsx files (need at least 5)"
  FAIL=1
fi

# No manual DOM manipulation
INNERHTML=$(grep -r "\.innerHTML\s*=" entrypoints --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')
CREATEELEM=$(grep -r "document.createElement" entrypoints --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')

if [ "$INNERHTML" = "0" ] && [ "$CREATEELEM" = "0" ]; then
  echo "PASS: No manual DOM manipulation"
else
  echo "FAIL: Found $INNERHTML innerHTML and $CREATEELEM createElement calls"
  grep -r "\.innerHTML\s*=" entrypoints --include="*.ts" --include="*.tsx"
  grep -r "document.createElement" entrypoints --include="*.ts" --include="*.tsx"
  FAIL=1
fi

# Build succeeds
npm run build > /tmp/build.log 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Build succeeds"
else
  echo "FAIL: Build failed"
  tail -20 /tmp/build.log
  FAIL=1
fi

# Tests pass
npm run test > /tmp/test.log 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Tests pass"
else
  echo "FAIL: Tests failed"
  tail -20 /tmp/test.log
  FAIL=1
fi

exit $FAIL
```

---

## Phase 6: Cross-Browser Support

### Status: SKIP

Chrome-only for now. May revisit in future.

---

## Phase 7: Developer Experience

### Completion Criteria

| Check | Command | Expected Result |
|-------|---------|-----------------|
| ESLint config | `test -f eslint.config.js -o -f eslint.config.mjs -o -f .eslintrc.js && echo "exists"` | `exists` |
| Prettier config | `test -f .prettierrc -o -f .prettierrc.json -o -f prettier.config.js && echo "exists"` | `exists` |
| Lint script | `grep '"lint"' package.json` | Found |
| Format script | `grep '"format"' package.json` | Found |
| Lint passes | `npm run lint` | No errors |
| Format check passes | `npm run format:check 2>/dev/null \|\| npm run format -- --check` | No errors |
| Pre-commit hooks | `test -d .husky -o -f .git/hooks/pre-commit && echo "exists"` | `exists` |
| README has setup | `grep -ciE "development\|setup\|install\|getting started" README.md` | >= 3 |
| Contributing guide | `test -f CONTRIBUTING.md && echo "exists"` | `exists` |

### Verification Script
```bash
#!/bin/bash
echo "=== Phase 7 Verification ==="
FAIL=0

# ESLint
if [ -f eslint.config.js ] || [ -f eslint.config.mjs ] || [ -f .eslintrc.js ] || [ -f .eslintrc.json ]; then
  echo "PASS: ESLint config exists"
else
  echo "FAIL: No ESLint config"
  FAIL=1
fi

# Prettier
if [ -f .prettierrc ] || [ -f .prettierrc.json ] || [ -f prettier.config.js ] || [ -f prettier.config.mjs ]; then
  echo "PASS: Prettier config exists"
else
  echo "FAIL: No Prettier config"
  FAIL=1
fi

# Lint passes
npm run lint > /tmp/lint.log 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Lint passes"
else
  echo "FAIL: Lint errors"
  tail -20 /tmp/lint.log
  FAIL=1
fi

# Pre-commit hooks
if [ -d .husky ] || [ -f .git/hooks/pre-commit ]; then
  echo "PASS: Pre-commit hooks exist"
else
  echo "FAIL: No pre-commit hooks"
  FAIL=1
fi

# README has setup instructions
SETUP_LINES=$(grep -ciE "development|setup|install|getting started" README.md 2>/dev/null || echo "0")
if [ "$SETUP_LINES" -ge "3" ]; then
  echo "PASS: README has setup instructions"
else
  echo "FAIL: README lacks setup documentation (found $SETUP_LINES references)"
  FAIL=1
fi

# CONTRIBUTING.md exists
if [ -f CONTRIBUTING.md ]; then
  echo "PASS: CONTRIBUTING.md exists"
else
  echo "FAIL: No CONTRIBUTING.md"
  FAIL=1
fi

# Build still works
npm run build > /tmp/build.log 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Build succeeds"
else
  echo "FAIL: Build failed"
  FAIL=1
fi

# Tests still pass
npm run test > /tmp/test.log 2>&1
if [ $? -eq 0 ]; then
  echo "PASS: Tests pass"
else
  echo "FAIL: Tests failed"
  FAIL=1
fi

exit $FAIL
```

---

## Final Integration Verification

Run after ALL phases complete:

```bash
#!/bin/bash
echo "=== FINAL INTEGRATION VERIFICATION ==="

# 1. Clean install
echo "Step 1: Clean install..."
rm -rf node_modules
npm install
if [ $? -ne 0 ]; then
  echo "FAIL: npm install failed"
  exit 1
fi
echo "PASS: npm install"

# 2. Build succeeds
echo "Step 2: Build..."
npm run build
if [ $? -ne 0 ]; then
  echo "FAIL: Build failed"
  exit 1
fi
echo "PASS: Build"

# 3. Tests pass
echo "Step 3: Tests..."
npm run test
if [ $? -ne 0 ]; then
  echo "FAIL: Tests failed"
  exit 1
fi
echo "PASS: Tests"

# 4. Lint passes
echo "Step 4: Lint..."
npm run lint
if [ $? -ne 0 ]; then
  echo "FAIL: Lint failed"
  exit 1
fi
echo "PASS: Lint"

# 5. No JavaScript files remain
echo "Step 5: No JS files..."
JS_FILES=$(find entrypoints utils -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
if [ "$JS_FILES" != "0" ]; then
  echo "FAIL: $JS_FILES .js files remain"
  find entrypoints utils -name "*.js"
  exit 1
fi
echo "PASS: No JS files"

# 6. Coverage check
echo "Step 6: Coverage..."
npm run test:coverage > /tmp/coverage.log 2>&1
COVERAGE=$(grep "All files" /tmp/coverage.log | awk '{print $4}' | tr -d '%' | cut -d'.' -f1)
if [ -n "$COVERAGE" ] && [ "$COVERAGE" -ge "85" ]; then
  echo "PASS: Coverage at ${COVERAGE}%"
else
  echo "FAIL: Coverage ${COVERAGE}% < 85%"
  exit 1
fi

echo ""
echo "=========================================="
echo "  ALL AUTOMATED CHECKS PASSED"
echo "=========================================="
echo ""
echo "=== MANUAL VERIFICATION REQUIRED ==="
echo "1. Load extension from .output/chrome-mv3/"
echo "2. Open sidepanel"
echo "3. Test: Event List loads"
echo "4. Test: Page capture works"
echo "5. Test: Event editor saves"
echo "6. Test: Settings persist"
echo "7. Test: Bundle management works"
echo ""
echo "Extension ready for release when manual tests pass."
```

---

## Orchestrator Pseudocode

```python
PHASES = [2, 3, 4, 5, 7]  # Phase 6 skipped
MAX_RETRIES = 3

for phase in PHASES:
    print(f"Starting Phase {phase}")

    # 1. Spawn sub-agent
    result = spawn_agent(
        task=f"Complete Phase {phase} of WXT migration",
        context=[
            read_file("docs/autonomous-migration-checklist.md"),
            read_file("docs/code-simplifier-prompt.md"),
        ],
        codebase=current_codebase
    )

    # 2. Verification loop
    retries = 0
    while retries < MAX_RETRIES:
        # Run verification script
        verification = run_verification_script(phase)

        if not verification.passed:
            result = spawn_agent(
                task=f"Fix Phase {phase} failures:\n{verification.failures}",
                context=verification.output
            )
            retries += 1
            continue

        # Run Code Simplifier
        changed_files = git_diff_files("HEAD~1")
        simplifier_result = spawn_agent(
            model="opus",
            prompt=read_file("docs/code-simplifier-prompt.md"),
            files=changed_files
        )

        if simplifier_result.made_changes:
            # Re-verify after simplification
            verification = run_verification_script(phase)
            if not verification.passed:
                retries += 1
                continue

        # Phase complete
        git_commit(f"Complete Phase {phase}")
        break

    if retries >= MAX_RETRIES:
        alert_human(f"Phase {phase} failed after {MAX_RETRIES} retries")
        break

# Final verification
run_final_integration_verification()
```

---

## Notes for Sub-Agents

1. **Don't claim completion until you've run the verification script yourself**
2. **If a check fails, fix it before reporting done**
3. **Each phase must leave the extension in a working state**
4. **Commit after each phase with descriptive message**
5. **If stuck, report specific blockers rather than vague "done"**
6. **The Code Simplifier will review your work - write clean code the first time**
7. **Tests must pass at every phase, not just Phase 3**

---

## Required Files

The orchestrator and sub-agents need these files:

| File | Purpose |
|------|---------|
| `docs/autonomous-migration-checklist.md` | This file - verification criteria |
| `docs/code-simplifier-prompt.md` | Simplicity review prompt (run after each phase) |
| `docs/wxt-modernization-plan.md` | Original plan with context |

**IMPORTANT:** Always run the Code Simplifier (`docs/code-simplifier-prompt.md`) after each phase passes verification. This is not optional.

# Naghshman Android Shell and Myket APK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Meydan-branded Naghshman Android WebView APK for Myket with one splash lifecycle, resilient offline behavior, safe-area layout, and a validated 35–45 MiB arm64 release artifact.

**Architecture:** Keep the native Expo splash until a React overlay with identical branding is mounted, then keep that overlay above the WebView until its first successful document load. Extract first-load retry decisions into a pure state helper, keep an already loaded WebView mounted across network changes, and enforce APK architecture/optimization/size through Expo config and CI.

**Tech Stack:** Expo SDK 57, React Native 0.86, Expo Router, react-native-webview, react-native-safe-area-context, Expo Build Properties, EAS Build, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-09-27-android-shell-release-design.md`

## Global Constraints

- Myket receives a release APK targeting only `arm64-v8a`.
- Final APK size must be between 35 MiB and 45 MiB inclusive.
- Brand color is Meydan red `#dc2626`.
- Use the supplied dotless splash artwork; render three animated dots at runtime in right-to-left order.
- Do not unmount a loaded WebView when network state changes.
- Preserve bridge origin validation, secure refresh-token persistence, media saving, sharing, copying, and external-browser behavior.
- Do not create or hand-edit `android/` or `ios/`; this project uses Expo CNG.

## Review Focus

- Initial offline launch: keep the branded splash, avoid the English WebView error, and retry when reachability returns.
- Offline after initial load: preserve the current WebView/document and leave offline UI to the frontend.
- Failed subresource or HTTP 5xx after initial load: do not reset the whole shell or bring the launch splash back.
- Display cutouts and gesture/three-button navigation: keep document content within top and bottom safe insets.
- CI size boundary: accept exactly 35 or 45 MiB and reject one byte outside either boundary.

---

### Task 1: Release configuration and brand assets

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `app.json`
- Create: `assets/images/meydan-icon.png`
- Create: `assets/images/meydan-icon-foreground.png`
- Create: `assets/images/splash-dotless.jpg`
- Create: `scripts/verify-release-config.mjs`

**Interfaces:**
- Consumes: Meydan `app/icon.svg` and uploaded `1000042855.jpg`.
- Produces: `BRAND_RED = '#dc2626'` config values, arm64-only Expo prebuild settings, and production image assets.

- [ ] **Step 1: Write `scripts/verify-release-config.mjs` to assert release invariants**

Assert the app icon paths, splash background, `buildArchs: ['arm64-v8a']`, release minification/resource shrinking/bundle compression/legacy packaging, package ID, and positive Android version code.

- [ ] **Step 2: Run the config test and verify it fails**

Run: `node --test scripts/verify-release-config.mjs`
Expected: FAIL because Expo Build Properties and Meydan assets are not configured.

- [ ] **Step 3: Install the SDK-compatible `expo-build-properties` and update Expo config**

Run: `npx expo install expo-build-properties`
Configure arm64-only, minify, shrink resources, bundle compression, legacy packaging, disabled unused React Native GIF/WebP decoders, red application/system colors, release icon paths, and `versionCode`.

- [ ] **Step 4: Import and optimize the brand assets**

Rasterize Meydan `app/icon.svg` to 1024×1024 PNG assets and copy the supplied dotless splash at its native aspect ratio without baking dots into it.

- [ ] **Step 5: Run the config test**

Run: `node --test scripts/verify-release-config.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app.json assets/images scripts/verify-release-config.mjs
git commit -m "feat: configure optimized Myket release"
```

### Task 2: First-load lifecycle state

**Files:**
- Create: `src/lib/web-shell-state.ts`
- Create: `src/lib/web-shell-state.test.ts`

**Interfaces:**
- Produces: `reduceWebShellState(state: WebShellState, event: WebShellEvent): WebShellState` and `shouldRetryInitialLoad(previous: WebShellState, nextOnline: boolean): boolean`.
- Consumers: `NativeWebShell` in Task 4.

- [ ] **Step 1: Write failing state-machine tests**

Cover initial success, initial failure, reconnection retry, disconnect after success, later 5xx, and the rule that the splash never reappears after the first successful load.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test --experimental-strip-types src/lib/web-shell-state.test.ts`
Expected: FAIL because `web-shell-state.ts` does not exist.

- [ ] **Step 3: Implement the pure reducer and retry predicate**

Represent only `initialReady`, `initialFailed`, and `online`; never encode a state that removes already displayed content.

- [ ] **Step 4: Verify the tests pass**

Run: `node --test --experimental-strip-types src/lib/web-shell-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/web-shell-state.ts src/lib/web-shell-state.test.ts
git commit -m "test: define WebView first-load lifecycle"
```

### Task 3: Unified animated splash

**Files:**
- Replace: `src/components/animated-icon.tsx` with `src/components/launch-splash.tsx`
- Delete: `src/components/animated-icon.web.tsx`
- Delete: `src/components/animated-icon.module.css`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Produces: `LaunchSplash({ visible, onMounted }: { visible: boolean; onMounted: () => void })`.
- Consumes: `assets/images/splash-dotless.jpg` and brand red.
- Consumer: `NativeWebShell` in Task 4.

- [ ] **Step 1: Implement `LaunchSplash` using React Native `Animated`**

Render the dotless artwork with `cover`, position three 18 px dots at the artwork's lower loading area, loop opacity in right-to-left order, honor reduced motion with a static high/medium/low state, and fade the overlay only when `visible` becomes false.

- [ ] **Step 2: Move native splash ownership out of the root overlay**

Keep `SplashScreen.preventAutoHideAsync()` at module scope in `_layout.tsx`, remove the old overlay, and wrap the router in `SafeAreaProvider`.

- [ ] **Step 3: Run lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components src/app/_layout.tsx
git commit -m "feat: add unified animated launch splash"
```

### Task 4: Safe, offline-resilient WebView shell

**Files:**
- Modify: `src/components/native-web-shell.tsx`
- Modify: `src/lib/native-bridge.test.ts`

**Interfaces:**
- Consumes: `LaunchSplash`, `reduceWebShellState`, `shouldRetryInitialLoad`, and safe-area insets.
- Produces: a persistent WebView with initial-load splash coordination and safe-area layout.

- [ ] **Step 1: Extend bridge regression tests for allowed app navigation**

Pin HTTPS host allowlisting and confirm malformed/external schemes remain rejected after the shell refactor.

- [ ] **Step 2: Remove native offline replacement and duplicate WebView loader**

Delete `OfflineScreen`, `renderLoading`, `startInLoadingState`, and the condition that returns a different tree when connectivity changes.

- [ ] **Step 3: Coordinate splash and first document readiness**

Hide the native Expo splash only after `LaunchSplash.onMounted`, keep `LaunchSplash` visible until the first top-level load succeeds, and never show it again for later navigations or errors.

- [ ] **Step 4: Add initial reconnect retry and safe-area layout**

Reload only when the first load failed and reachability changes to online. Use top/bottom safe insets around the WebView, red system-area backgrounds, a light StatusBar, and a slim red progress line only after initial readiness.

- [ ] **Step 5: Run focused and full static checks**

Run: `node --test --experimental-strip-types src/lib/*.test.ts && npm run lint && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/native-web-shell.tsx src/lib
git commit -m "fix: preserve WebView across offline transitions"
```

### Task 5: Dead-code cleanup and APK size gate

**Files:**
- Delete: unused starter components and images under `src/components/` and `assets/images/`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `eas.json`
- Modify: `.github/workflows/build-android.yml`
- Create: `scripts/check-apk-size.mjs`
- Create: `scripts/check-apk-size.test.mjs`

**Interfaces:**
- Produces: `assertApkSize(bytes: number): void`, a `myket` EAS profile, and a CI artifact that has passed the size contract.

- [ ] **Step 1: Write boundary tests for `assertApkSize`**

Assert pass at 35 and 45 MiB and failure at one byte below/above.

- [ ] **Step 2: Verify the size tests fail**

Run: `node --test scripts/check-apk-size.test.mjs`
Expected: FAIL because the checker does not exist.

- [ ] **Step 3: Implement the APK size checker**

Export `assertApkSize(bytes)` and provide a CLI that receives an APK path, reports MiB to two decimals, and exits nonzero outside the inclusive range.

- [ ] **Step 4: Remove unused native dependencies and starter files**

Remove dependencies only after `rg` confirms no production imports. Retain modules required by the WebView bridge, safe area, fonts, splash, secure storage, network retry, and media saving.

- [ ] **Step 5: Configure and validate the Myket workflow**

Build `--profile myket --platform android`, download the EAS artifact, run `scripts/check-apk-size.mjs`, and upload the accepted APK as a workflow artifact.

- [ ] **Step 6: Run all local verification**

Run: `npm ci && node --test --experimental-strip-types src/lib/*.test.ts && node --test scripts/*.test.mjs && npm run lint && npx tsc --noEmit && npx expo-doctor`
Expected: all commands PASS.

- [ ] **Step 7: Inspect generated native configuration**

Run: `npx expo prebuild --clean --no-install --platform android` in a temporary copy and verify `reactNativeArchitectures=arm64-v8a`, minification/resource shrinking, icon resources, package ID, and version code.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "ci: enforce Myket APK size contract"
```

### Task 6: Push and remote verification

**Files:** none

**Interfaces:**
- Consumes: verified local commits.
- Produces: pushed `main`, EAS build run, and measured APK result.

- [ ] **Step 1: Re-run completion verification from a clean worktree**

Run the Task 5 verification command and require a clean `git status --short` afterward.

- [ ] **Step 2: Push `main` to GitHub**

Run: `git push origin main`
Expected: remote `main` advances to the verified HEAD.

- [ ] **Step 3: Monitor GitHub Actions and EAS output**

Confirm the workflow reaches the build, download, size-check, and artifact-upload steps. If the artifact is outside 35–45 MiB, inspect it with APK Analyzer/apktool data, adjust only identified size contributors, and rebuild.

- [ ] **Step 4: Report evidence**

Provide commit SHA, workflow result, exact APK byte/MiB size, supported ABI, and any remaining store-signing action.

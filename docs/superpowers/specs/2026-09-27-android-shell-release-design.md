# Naghshman Android Shell and Myket APK Design

## Goal

Deliver a production-ready Android WebView shell for `naghshman.ir` whose signed Myket APK is between 35 and 45 MB, uses Meydan branding, presents one continuous splash experience, preserves the loaded web application through connectivity changes, and keeps all web content inside Android safe areas.

## Distribution and size contract

- The Myket artifact is a release APK, not an AAB or debug/development build.
- The APK targets `arm64-v8a` only. The accepted trade-off is that 32-bit-only Android devices cannot install it.
- Release minification, unused-resource shrinking, JavaScript bundle compression, and compressed native-library packaging are enabled.
- Unused template dependencies, components, and assets are removed when they are not reachable from the production application.
- CI measures the final APK file in bytes and fails unless its size is between 35 MiB and 45 MiB inclusive.
- The workflow uploads the validated APK as a GitHub Actions artifact.

## Branding

- The launcher icon is generated from `app/icon.svg` in the `mohammad-mohammad-soltani/meydan` repository.
- Meydan brand red `#dc2626` is the application primary color and the native system-area/loading accent.
- The supplied dotless artwork is the visual splash background.
- Launcher and adaptive-icon assets follow Expo's Android icon requirements and avoid the old Expo template artwork.

## Single splash lifecycle

1. The native Expo splash is prevented from auto-hiding.
2. The React splash overlay renders the supplied dotless artwork before the native splash is hidden, keeping the transition visually continuous.
3. Three native animated dots are drawn over the artwork. Their opacity rises and falls in right-to-left order in a continuous loop.
4. The WebView loads behind the overlay without its own full-screen loading renderer.
5. The splash overlay fades away only after the initial top-level web document completes loading.
6. Later WebView navigations may use a slim red progress indicator but never show the launch splash again.

If the initial document cannot load, the splash remains visible and the shell retries after connectivity returns. This avoids exposing a native English WebView error page.

## Connectivity behavior

- A connectivity change never unmounts or replaces a WebView that has already displayed content.
- The native shell does not show its current offline screen. Offline behavior remains owned by the web frontend and its service worker/cache logic.
- Network state is used only to retry an initial failed load when internet reachability returns.
- Existing secure refresh-token restoration and the restricted native bridge remain intact.

## Safe areas and system UI

- The application root provides safe-area context.
- The WebView is inset on the top and bottom so page content cannot render beneath the status bar, display cutout, gesture area, or three-button navigation bar.
- System-area backgrounds use Meydan red and status-bar icons use the light style for contrast.
- Splash artwork covers the screen while respecting its own full-screen composition; the WebView receives the safe-area treatment after splash dismissal.

## Additional cleanup

- Remove the old animated Expo splash and duplicate WebView loading screen.
- Remove dead starter UI routes/components/assets and native dependencies that are no longer used.
- Keep external navigation restricted to the existing allowlist and preserve share, copy, media-save, login persistence, and logout behavior.
- Give the release build a monotonically increasing Android `versionCode` suitable for Myket updates.

## Verification

- Unit tests cover native bridge validation and any extracted first-load/retry state logic.
- Run `npm ci`, the Node tests, Expo lint, TypeScript type checking, and Expo Doctor.
- Generate an Expo prebuild/config inspection to verify the arm64-only and release-shrinking settings.
- Run the EAS Myket build, download the produced APK, verify the 35–45 MiB contract, and inspect the APK when the size is outside the target.
- Confirm CI and GitHub status after pushing `main`.

## Acceptance criteria

- One continuous branded splash is visible from launch until the first web page is ready.
- The three splash dots animate right-to-left and are not baked into the artwork.
- No duplicate WebView loading screen appears.
- Going offline after the page loads does not replace or unload the page.
- Web content does not sit beneath Android system bars.
- The launcher uses the Meydan icon and the shell uses Meydan red.
- The distributable Myket APK is a release, arm64 APK between 35 and 45 MiB.

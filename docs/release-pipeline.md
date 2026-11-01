# Release pipeline: GitHub → S3 → the admin panel

Every push to `main` (or a manual run of **Build Android APK**) is reported live to the Meydan
admin panel, **پنل مدیریت ← به‌روزرسانی اپ**: its steps and log while it builds, then the signed
APK, uploaded to S3. The panel lists every build in one table. An administrator chooses there:

- **انتخاب دانلود**: which APK the download link points to (the site's install prompt, the app's
  update screen). It is never chosen automatically; a new build only appears in the list.
- **اجبار**: the version below which installed apps are locked behind the update screen. Forcing a
  build also makes it (or a newer one) the download link, because a link to something older than the
  minimum would lock the user again after installing it.

```
GitHub Actions ──start / steps / log (signed)──▶ backend /ci/app-builds/*  ──▶ panel
      │  APK
      └──── PUT to a one-time S3 URL the backend hands out ──▶ S3 ◀── backend verifies size + MD5,
                                                                      makes it public, checks the link
```

## One-time setup

1. **Backend** (`meydan-backend/.env`, then redeploy the backend from the panel «دیپلوی»):
   ```
   MEYDAN_APP_CI_SECRET=<openssl rand -hex 32>
   ```
   S3 must be configured as for media (`MEDIA_STORAGE=s3` and the `S3_*` / `MEDIA_PUBLIC_URL` values).
   The tables are created by the plugin itself on the first request.
2. **This repo** → Settings → Secrets and variables → Actions:
   - **secret** `MEYDAN_CI_SECRET`: the same value as `MEYDAN_APP_CI_SECRET`.
   - **variable** `MEYDAN_CI_API`: `https://meydanbackend.naghshman.ir/wp-json/meydan/v1`
3. Push to `main`. The build shows up in the panel within seconds. The panel's «اتصال GitHub» tile says
   whether the backend side is complete.

GitHub's servers (outside Iran) must be able to reach **both** the backend URL and the S3 endpoint.
Without the secret or the variable the workflow still builds and keeps its GitHub artifact; it just
isn't reported (`::notice::` in the log says so).

## What each step does

| Step | Reported as | Notes |
|---|---|---|
| `npm ci`, tests, lint, typecheck | تست و بررسی کد | output is shipped live |
| `eas build --local` | ساخت APK | the longest step |
| APK size ceiling (30 MiB) | بررسی حجم | |
| `report.mjs upload` | آپلود روی S3 | reads `versionCode` from the APK itself (EAS assigns it), refuses another package than `ir.naghshman.app`, uploads, and has the backend verify |

Everything is driven by `scripts/ci/report.mjs` (no dependencies; tests in `scripts/ci-report*.test.mjs`).
Reporting is best effort and never fails a build. **Only the APK upload can**: a build nobody can
download is not a release.

## Security

- Every request is signed (HMAC-SHA256 over method, route, timestamp, nonce and body hash; ±2 minutes;
  a nonce is accepted once). Without the signature header the `/ci/` routes answer 404 like any
  missing path.
- No S3 key lives in GitHub: the backend signs a URL for **one object key**, valid 15 minutes.
- The secret can create builds and upload an APK; it **cannot publish**. Only a signed-in administrator
  can pick the download build or force an update, and forcing needs the build's `versionCode` typed
  again. The panel shows the commit, the run (link to GitHub) and the APK's SHA-256 to check against.
- Log lines are stripped of control characters, cut to 2000 characters, capped at 40 000 per build, and
  secret-looking values (tokens, signatures, anything named `*TOKEN*`/`*SECRET*`/`*PASSWORD*`…) are
  replaced by `***` before they leave the runner.

## Keeping it tidy

The newest **30** builds are kept. Older ones (APK, log, row) are removed automatically, except a build
that is still running, the download build, the forced build, and every build at least as new as the
older of those two. A build that stays silent for 45 minutes (a killed runner) is marked failed.

## When something is off

| You see | Cause |
|---|---|
| No build appears | secret/variable missing, or GitHub can't reach the backend; look for `::warning::` in the **Open the build** step |
| «آپلود» fails with a `403` from S3 | the one-time URL expired or the bucket rejects the PUT |
| «لینک عمومی … پاسخ ۴۰۳ می‌دهد» | the bucket isn't public-read (policy/ACL); the file is uploaded but not selectable |
| «حجم/MD5 یکی نیست» | the upload was cut or altered; run the workflow again |
| A build stuck on «در حال بیلد» | the runner died; it is marked failed after 45 minutes |

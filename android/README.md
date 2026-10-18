# BeatVision for Android — debug preview

Android MVP: a narrow WebView shell pointing at the **existing production BeatVision studio** at
https://beat-vision-theta.vercel.app/. This is not a rewrite, offline app, new
backend, or proof that video generation works end to end.

## What is in scope
- Existing email/password Supabase session and existing server-side ownership rules.
- Existing live React UI and studio routes, including project/song/world/style/scenes/motion.
- Android system document picker for user-selected audio/media upload.
- Back navigation, video rendering through Android WebView, external links and HTTPS downloads handed to a browser.
- HTTPS-only first-party top-level navigation. No JS bridge, hardcoded service-role key or native storage permission.

## Build without committing a keystore
The GitHub Actions workflow `BeatVision Android debug APK` runs for an Android-related PR or manually.
After successful checks, open the workflow run and download its artifact named
`beatvision-android-debug-apk`. Extract `app-debug.apk`, then install it on your
Android device after explicitly allowing installation from your files app.
This **debug APK** is suitable for testing, not Play Store release.
Do not distribute this debug-signed build as an official release.

From a machine with JDK 17, Android SDK 35, and Gradle 8.9:
```sh
cd android
gradle :app:testDebugUnitTest :app:assembleDebug :app:lintDebug
```
Find output at `android/app/build/outputs/apk/debug/app-debug.apk`.

## Device verification checklist (must be performed on an actual Android device)
1. Open the app with mobile data, sign in, terminate/reopen, confirm session persists.
2. Open an **existing** project, go from Song through World and back.
3. Select an audio file using Android's document picker; confirm filename and existing saved upload in Supabase.
4. Open a valid approved scene video, play/pause it and navigate away/back; verify no repeated URL reset.
5. Exercise an actually authorized download link (if one exists); ensure the browser downloads it. Never infer download permission from render existence.
6. Open a third-party link; verify it opens outside the embedded studio.
7. Switch connectivity off and back on; ensure the app recovers after relaunch.
8. Check small-screen layout, keyboard covers, back navigation and exit behavior.

## Limitations
- Requires network access; loading the production UI does not mean all BeatVision services are healthy.
- The native shell displays whatever version the production domain currently serves.
- Any existing production blocker remains a blocker in Android, including free-provider availability, motion jobs and final export.
- User-initiated `blob:` downloads and auth links requiring an external identity-provider browser have **not** been device verified.
- Camera capture, push notifications, offline rendering and Play Store signing are not implemented.
- The icon is provisional and should be approved before an official store release.
- WebView security is intentionally limited: JavaScript and DOM storage are enabled only for the first-party app; arbitrary top-level navigation opens in a normal browser; local file URLs, mixed-content HTTP, third-party cookies, and JavaScript bridges are disabled.

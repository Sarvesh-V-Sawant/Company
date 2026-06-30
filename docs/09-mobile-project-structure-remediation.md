# 09 — Mobile Project Structure Remediation

**Date:** 2026-06-16  
**Status:** PENDING APPROVAL

---

## Verdict: C — Not Compatible

`apps/mobile` is a manually scaffolded Dart directory. It was never created via `flutter create`. It cannot be built with the Flutter CLI, opened as a Flutter project in Android Studio, or analyzed by the Flutter extension in VS Code.

---

## Root Cause

The scaffold created the directory structure and Dart source files by hand. This approach skips all Flutter tooling initialization:

- No platform bindings generated (`android/` is an empty shell)
- No dependency resolution (`pubspec.lock` absent, `.dart_tool/` absent)
- No plugin registration files (`.flutter-plugins`, `.flutter-plugins-dependencies` absent)
- No Gradle build system (`build.gradle`, `settings.gradle`, `gradlew`, `gradle-wrapper.jar` absent)
- No Android manifest (`AndroidManifest.xml` absent)
- No Kotlin entry point (`MainActivity.kt` absent)
- No resource files (`res/values/strings.xml`, `res/drawable/` absent)

---

## Missing Components

| Component | Expected Location | Status |
|---|---|---|
| Root `build.gradle` | `android/build.gradle` | MISSING |
| App `build.gradle` | `android/app/build.gradle` | MISSING |
| `settings.gradle` | `android/settings.gradle` | MISSING |
| `gradle-wrapper.properties` | `android/gradle/wrapper/gradle-wrapper.properties` | MISSING |
| `gradle-wrapper.jar` | `android/gradle/wrapper/gradle-wrapper.jar` | MISSING |
| `gradlew` | `android/gradlew` | MISSING |
| `gradlew.bat` | `android/gradlew.bat` | MISSING |
| `local.properties` | `android/local.properties` | MISSING |
| `gradle.properties` | `android/gradle.properties` | MISSING |
| `AndroidManifest.xml` | `android/app/src/main/AndroidManifest.xml` | MISSING |
| `MainActivity.kt` | `android/app/src/main/kotlin/com/company/company_mobile/MainActivity.kt` | MISSING |
| `strings.xml` | `android/app/src/main/res/values/strings.xml` | MISSING |
| `styles.xml` | `android/app/src/main/res/values/styles.xml` | MISSING |
| `ic_launcher.png` (all densities) | `android/app/src/main/res/mipmap-*/` | MISSING |
| `google-services.json` | `android/app/google-services.json` | MISSING (required for Firebase) |
| `pubspec.lock` | `apps/mobile/pubspec.lock` | MISSING |
| `.dart_tool/` | `apps/mobile/.dart_tool/` | MISSING |
| `.flutter-plugins` | `apps/mobile/.flutter-plugins` | MISSING |
| `.flutter-plugins-dependencies` | `apps/mobile/.flutter-plugins-dependencies` | MISSING |

---

## Remediation Procedure

Run all commands from the monorepo root (`D:\projects\Company`) unless otherwise noted.

### Prerequisites

- Flutter 3.38.5 installed and on PATH ✅ (confirmed)
- Android SDK installed and `ANDROID_HOME` set (required for `flutter build`)
- `google-services.json` downloaded from Firebase Console for package `com.company.company_mobile`

---

### Step 1 — Back up manually created files

```powershell
Copy-Item apps/mobile/pubspec.yaml apps/mobile/pubspec.yaml.bak
```

`lib/` files will NOT be overwritten by `flutter create` (Flutter skips existing files). The backup is only needed for `pubspec.yaml`, which Flutter replaces with a minimal template.

---

### Step 2 — Run `flutter create` to generate Android platform files

Run from inside `apps/mobile`:

```powershell
cd apps/mobile
flutter create --org com.company --platforms android --project-name company_mobile .
```

**What this generates:**

- `android/build.gradle` — root Gradle config
- `android/app/build.gradle` — app-level Gradle config with `com.company.company_mobile` applicationId
- `android/settings.gradle` — project name binding
- `android/gradle/wrapper/gradle-wrapper.properties` — Gradle 8.x wrapper config
- `android/gradle/wrapper/gradle-wrapper.jar` — Gradle wrapper bootstrap binary
- `android/gradlew` + `android/gradlew.bat` — Gradle wrapper scripts
- `android/local.properties` — SDK path (generated from your machine; gitignored)
- `android/gradle.properties` — AndroidX + Kotlin config
- `android/app/src/main/AndroidManifest.xml` — app manifest with INTERNET permission
- `android/app/src/main/kotlin/com/company/company_mobile/MainActivity.kt` — Flutter entry activity
- `android/app/src/main/res/values/strings.xml` — app name resource
- `android/app/src/main/res/values/styles.xml` — launch theme
- `android/app/src/main/res/mipmap-*/ic_launcher.png` — all density icons
- `android/app/src/debug/AndroidManifest.xml` — debug network config
- `android/app/src/profile/AndroidManifest.xml` — profiling manifest
- `.dart_tool/package_config.json` — package resolution
- `.flutter-plugins` — plugin list
- `.flutter-plugins-dependencies` — plugin graph

**What Flutter will NOT overwrite** (files that already exist):

- `lib/main.dart` — Flutter skips with "Existing file lib/main.dart was not overwritten"
- All other files under `lib/`
- `analysis_options.yaml`
- `integration_test/`
- `test/`

---

### Step 3 — Restore the production `pubspec.yaml`

Flutter replaces `pubspec.yaml` with a minimal template. Restore the production version:

```powershell
# Still inside apps/mobile
Copy-Item pubspec.yaml.bak pubspec.yaml
Remove-Item pubspec.yaml.bak
```

The production `pubspec.yaml` already contains all required dependencies (`flutter_riverpod`, `go_router`, `dio`, `firebase_core`, `firebase_messaging`, etc.) and must not be replaced.

---

### Step 4 — Resolve dependencies

```powershell
# Still inside apps/mobile
flutter pub get
```

This generates:
- `pubspec.lock` — pinned dependency tree
- Updates `.dart_tool/package_config.json` with resolved package paths
- Updates `.flutter-plugins` and `.flutter-plugins-dependencies`

Expected: all packages resolve without conflicts. If version conflicts appear, check [pub.dev](https://pub.dev) for compatible constraint adjustments.

---

### Step 5 — Add `google-services.json`

Firebase will fail to initialize without this file. It is NOT generated by `flutter create`.

1. Open [Firebase Console](https://console.firebase.google.com)
2. Select the HRMS project (or create one)
3. Add an Android app with package name `com.company.company_mobile`
4. Download `google-services.json`
5. Place it at `android/app/google-services.json`

This file contains API keys and must be gitignored:

Add to root `.gitignore` (if not already present):
```
apps/mobile/android/app/google-services.json
```

For CI/CD, inject via GitHub secret `GOOGLE_SERVICES_JSON` and write to the path before build.

---

### Step 6 — Verify static analysis

```powershell
# Still inside apps/mobile
flutter analyze
```

Expected: 0 errors. Warnings for unimplemented stubs are acceptable at this stage.

---

### Step 7 — Verify build (requires Android SDK)

```powershell
# Still inside apps/mobile
flutter build apk --debug
```

Expected: APK generated at `build/app/outputs/flutter-apk/app-debug.apk`.

If `ANDROID_HOME` is not set, `flutter doctor` will report the issue.

---

### Step 8 — Verify IDE compatibility

**Android Studio:**
1. File → Open → select `D:\projects\Company\apps\mobile`
2. Android Studio detects `pubspec.yaml` → prompts "Flutter project detected"
3. Run `flutter pub get` from IDE if prompted
4. No red errors in project view

**VS Code:**
1. Open `D:\projects\Company\apps\mobile` as workspace
2. Flutter extension detects project via `pubspec.yaml`
3. Bottom bar shows Flutter SDK version
4. No "Not a Flutter project" warnings

---

### Step 9 — Update `.gitignore` for Flutter-generated files

Ensure `apps/mobile/.gitignore` (or root `.gitignore`) includes:

```gitignore
# Flutter generated
apps/mobile/.dart_tool/
apps/mobile/.flutter-plugins
apps/mobile/.flutter-plugins-dependencies
apps/mobile/android/local.properties
apps/mobile/android/app/google-services.json
apps/mobile/build/
apps/mobile/android/.gradle/
apps/mobile/android/captures/
```

---

## Post-Remediation State

After all steps, `apps/mobile` will be a fully compatible Flutter 3.38.5 Android project:

| Check | Before | After |
|---|---|---|
| `flutter analyze` | ERROR — not a Flutter project | PASS |
| `flutter build apk` | FAIL — no Gradle files | PASS |
| Android Studio open | FAIL — unrecognized project | PASS |
| VS Code Flutter ext | WARN — not a Flutter project | PASS |
| `pubspec.lock` | MISSING | GENERATED |
| `.dart_tool/` | MISSING | GENERATED |
| `android/` build system | EMPTY | COMPLETE |
| Firebase init | FAIL — missing google-services.json | PASS (after Step 5) |

---

## Implementation Scope

This remediation:

- Generates Android platform boilerplate only — no feature code
- Preserves all 28 manually created Dart files in `lib/`
- Does not add `ios/`, `web/`, `linux/`, `macos/`, or `windows/` platforms (spec: Android-only)
- Does not modify any business logic

**Awaiting approval to proceed.**

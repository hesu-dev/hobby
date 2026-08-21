# Firefox Android Release Signing and Test Flow

## Package inputs

- Unsigned release package: `release/firefox-mobile.zip`
- Fixed release ID: `r20-json-exporter-firefox@reha.dev`
- Current release version: `0.8.5`

## Sign for self-distribution

1. Build the current release artifacts.
   - Run `./deploy.sh` from the `R20-JSONExporter/` project directory.
2. Verify the Firefox release package exists.
   - `release/firefox-mobile.zip`
3. Submit the package to AMO as `On your own` or sign it with `web-ext sign --channel=unlisted`.
4. Keep the add-on ID fixed as `r20-json-exporter-firefox@reha.dev`.
5. Download the signed `.xpi` from AMO.

## Android release install test

1. Copy the signed `.xpi` to the Android device.
2. Open Firefox for Android.
3. Go to `Settings > About Firefox`.
4. Tap the Firefox logo five times to unlock hidden settings.
5. Return to `Settings`.
6. Open `Install Extension from File`.
7. Select the signed `.xpi`.
8. Approve the install prompt.

## Android release smoke test

1. Open a Roll20 chat page in Firefox for Android.
2. Open the extension popup.
3. Tap `다운로드전 이미지 링크 확인`.
4. Confirm the avatar link editor appears and the mappings load.
5. Without editing any link, tap `ReadingLog 파일 다운로드`.
6. Confirm the JSON file is downloaded, or that the Firefox share/copy fallback appears if downloads are blocked.
7. Re-open the popup and change one avatar URL.
8. Tap `ReadingLog 파일 다운로드` again.
9. Confirm the new JSON reflects the edited avatar URL.
10. Confirm the exported filename matches the Roll20 campaign title when available.

## Regression checklist

- The popup shows `다운로드전 이미지 링크 확인`.
- The popup shows `ReadingLog 파일 다운로드`.
- Direct download works even if the avatar editor was never opened.
- Direct download stores the redirected avatar URL directly in `input.speakerImages.avatar.url`.
- Edited avatar mappings override the redirected URL in the exported JSON.
- The installed add-on version shown in Firefox is `0.8.5`.

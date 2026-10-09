# Android Stream media checks

These changes require a rebuilt APK. Browser PiP continues using the browser API.
Build with a JDK and Android SDK: run `npm run android:sync` in `frontend`, then
`./gradlew assembleDebug` in `frontend/android` (Windows: `gradlew.bat`).

On Android 8 or later:
- Play a direct video, enter PiP, and check that only video appears. Tap the window
  to use Android's play/pause and ten-second seek controls. Expand to restore the
  player; close the window and confirm playback stops. The outer controls depend
  on Android version/device and cannot reproduce another app's chrome exactly.
- Start a new download and open Stream > Downloads. Tap Pause. Progress must stop
  increasing and the row must remain in Downloading with a Continue button.
- Tap Continue. The same download ID must resume from the saved file length.
- Test two concurrent downloads: pausing one must leave the other running.
- Finish a download; Save to phone and Delete must still work.
- Background the app while downloading; the foreground-service notification
  keeps the transfer running. After process termination, reopen Downloads and
  continue the interrupted transfer. Android's service time limit also pauses it.
- Check an old DownloadManager download: status, Save, and Delete still work.
  User pause is supported for new app-managed downloads only.

The resumable worker uses HTTPS, HTTP Range plus If-Range validators, and private
app storage. If the server lacks resume support or the video changes, it safely
restarts the transfer. Expired URLs/network failures are reported as failures.

Automated frontend checks:
`node --test tests/streamPauseAndPip.test.cjs tests/streamDownloadDelete.test.cjs tests/streamPlayerCorners.test.cjs`
Native service and PiP require an Android build/device for final validation.

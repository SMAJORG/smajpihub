# Android AdMob integration (test only)

The local `SmajAds` Capacitor plugin uses Google Mobile Ads 25.5.0 and UMP 4.0.0.
The manifest uses the owner's registered App ID
`ca-app-pub-5494416741996222~8018024494` so UMP can obtain their consent messages.
All three ad unit IDs in Java are Google's Android demo IDs. There is deliberately
no production switch or remote ID input. The supplied production banner unit
`ca-app-pub-5494416741996222/1302131915` is stored, inactive, in
`frontend/android/admob.production.properties`. That file is not loaded by Gradle
or the bridge. Production ad requests require explicit owner approval, completed device QA,
configured UMP messages, and a separately reviewed activation change. Release builds
also use test IDs. No production native or rewarded IDs have been supplied.

## Controls

- Admin → Home & Services → Android test ad placements: master switch and separate
  home banner, store native, stream native, and optional discovery reward switches.
  All default off. Use Save changes. Existing authenticated, revision-controlled
  `/admin/site-content` persistence and public `/site-content` distribution are reused.
- Android Settings → Advertising privacy: device opt-in, consent review, UMP privacy
  choices when required, and immediate device-wide ad disable. App features never
  require advertising consent. Consent is refreshed each launch for opted-in devices.
- UMP failure or unavailable consent keeps ads off. Configure privacy messages for
  the registered app in the owner's AdMob account, including during test-ad QA.
  This deliberately fails closed if messaging is unavailable; do not fake consent
  to work around it. Exercise UMP on registered debug devices across relevant regions.
- Web, iOS, and Pi Browser never call the advertising bridge or display ad controls.

## Placement behavior

`frontend/src/lib/adPolicy.ts` is the fixed placement registry. Exact page matches
exclude authentication, payment, wallet, order, product detail, and video playback
screens. New placements require adding the key to both the registry and backend
allowlist. Ad settings are refreshed every 30 seconds while the Android controller
is mounted; admin disable propagates on the next successful refresh.

Banner and native ads render only within an empty slot reserved at the end of the
page content, above the fixed bottom navigation. The slot must be fully visible;
ads hide when it scrolls out of view or would intersect navigation. The viewport
and navigation retain their existing layout. Adaptive banners reload on window width
changes. No-fill,
route change, input focus, page hiding, and modal display remove the ad. Native
creative assets are rendered in `NativeAdView`, including MediaView and automatic
AdChoices. Native objects are destroyed on removal or activity pause/destroy.

Rewarded ads load only after the labeled optional button is pressed, never from
navigation. Leaving the placement while loading cancels presentation. The SDK earn
callback supplies only a thank-you message after dismissal. There is no Pi, token,
wallet, payment, or backend reward mutation. Any future valuable reward needs a
separate server-side verification and idempotency design.

## Validation

Run `node --test tests/adPlacements.test.cjs tests/siteContent.test.cjs` in backend;
`node --test tests/adPolicy.test.mjs tests/nativeAds.test.mjs` and `npm run build:android-web` in frontend;
then `npx cap sync android` and `gradlew.bat :app:assembleDebug` in frontend/android
(JDK and Android SDK required). No npm advertising plugin or generated Capacitor
plugin edits are required because this is a registered local Android plugin.

On a device, test all formats and both placement/device kill switches; deny/revoke
consent; navigate away during slow loads; close rewarded early; trigger offline and
no-fill; use keyboard, modals, rotation, app background/resume and small screens.
Confirm authentication and checkout remain usable with all ads unavailable.

Implementation verification: 6 backend content/placement tests and 5 frontend
policy/platform/geometry tests passed; backend TypeScript checking passed.
Full frontend typechecking and Vite build were interrupted after extended execution
without completion on this machine. Android compilation could not start because
Java/JAVA_HOME is unavailable. Complete those build checks and device QA before
approving production ads.

References: [SDK setup](https://developers.google.com/admob/android/quick-start),
[UMP consent](https://developers.google.com/admob/android/privacy), and
[Google test ads](https://developers.google.com/admob/android/test-ads).

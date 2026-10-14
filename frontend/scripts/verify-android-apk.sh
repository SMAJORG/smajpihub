#!/usr/bin/env bash
set -euo pipefail
apk="${1:?APK path required}"
: "${SMAJ_ANDROID_VERSION_CODE:?Version code is required}"
build_tools="$(find "${ANDROID_HOME:?Android SDK required}/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
"$build_tools/apksigner" verify --verbose --print-certs "$apk" > "$RUNNER_TEMP/smaj-apk-verification.txt"
"$build_tools/zipalign" -c -P 16 4 "$apk"
unzip -tq "$apk"
badging="$("$build_tools/aapt" dump badging "$apk")"
package_line="$(printf '%s\n' "$badging" | head -n 1)"
[[ "$package_line" == *"name='com.smajpihub.mobile'"* ]] || { echo 'Unexpected package name'; exit 1; }
[[ "$package_line" == *"versionCode='$SMAJ_ANDROID_VERSION_CODE'"* ]] || { echo 'Unexpected version code'; exit 1; }
[[ "$package_line" == *"versionName='$VITE_APP_VERSION'"* ]] || { echo 'APK and web version disagree'; exit 1; }
[[ "$badging" != *application-debuggable* ]] || { echo 'Refusing to publish a debug APK'; exit 1; }
new_cert="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$RUNNER_TEMP/smaj-apk-verification.txt")"
[[ "$new_cert" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'Signing certificate is missing'; exit 1; }
if gh api "repos/$GITHUB_REPOSITORY/releases/tags/android-latest" > "$RUNNER_TEMP/smaj-previous-release.json" 2>/dev/null; then
  previous_version="$(jq -r '.body' "$RUNNER_TEMP/smaj-previous-release.json" | sed -n 's/^Version: 1\.0\.\([0-9][0-9]*\).*$/\1/p')"
  [[ "$previous_version" =~ ^[0-9]+$ ]] || { echo 'Cannot determine previous published version'; exit 1; }
  (( SMAJ_ANDROID_VERSION_CODE > previous_version )) || { echo 'Release version must increase'; exit 1; }
  previous_url="$(jq -r '.assets[] | select(.name=="SMAJ-PI-HUB.apk") | .browser_download_url' "$RUNNER_TEMP/smaj-previous-release.json")"
  [[ "$previous_url" == https://github.com/SMAJORG/smajpihub/releases/download/* ]] || { echo 'Previous APK is missing'; exit 1; }
  curl --fail --location --retry 3 --output "$RUNNER_TEMP/smaj-previous.apk" "$previous_url"
  previous_sha="$(jq -r '.assets[] | select(.name=="SMAJ-PI-HUB.apk") | .digest // empty' "$RUNNER_TEMP/smaj-previous-release.json")"
  if [[ "$previous_sha" == sha256:* ]]; then
    printf '%s  %s\n' "${previous_sha#sha256:}" "$RUNNER_TEMP/smaj-previous.apk" | sha256sum --check
  fi
  "$build_tools/apksigner" verify --print-certs "$RUNNER_TEMP/smaj-previous.apk" > "$RUNNER_TEMP/smaj-previous-verification.txt"
  previous_cert="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$RUNNER_TEMP/smaj-previous-verification.txt")"
  [[ "$new_cert" == "$previous_cert" ]] || { echo 'Signing key changed: refusing to publish an incompatible update'; exit 1; }
fi
sha="$(sha256sum "$apk" | cut -d ' ' -f 1)"
size="$(stat -c %s "$apk")"
url="https://github.com/$GITHUB_REPOSITORY/releases/download/android-v$VITE_APP_VERSION/SMAJ-PI-HUB.apk"
jq -n --arg version "$VITE_APP_VERSION" --arg sha "$sha" --arg url "$url" --arg cert "$new_cert" --argjson code "$SMAJ_ANDROID_VERSION_CODE" --argjson size "$size" '{version:$version,versionCode:$code,url:$url,sha256:$sha,size:$size,signingCertificateSha256:$cert}' > "$(dirname "$apk")/SMAJ-PI-HUB-update.json"
echo 'APK signature, archive, alignment, version and signing-key continuity verified.'

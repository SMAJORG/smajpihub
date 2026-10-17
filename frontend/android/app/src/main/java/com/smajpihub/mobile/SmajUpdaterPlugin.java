package com.smajpihub.mobile;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Downloads and checks an update before giving it to Android's package installer. */
@CapacitorPlugin(name = "SmajUpdater")
public class SmajUpdaterPlugin extends Plugin {
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private PluginCall pendingPermission;
    private static final long MAX_APK_BYTES = 300L * 1024 * 1024;

    @PluginMethod public void getInfo(PluginCall call) {
        try {
            PackageInfo info = installed();
            JSObject result = new JSObject();
            result.put("version", info.versionName);
            result.put("versionCode", versionCode(info));
            call.resolve(result);
        } catch (Exception error) { call.reject("Could not read the installed app version.", "VERSION_UNAVAILABLE"); }
    }
    @PluginMethod public void install(PluginCall call) {
        if (!busy.compareAndSet(false, true)) { call.reject("An update is already in progress.", "UPDATE_BUSY"); return; }
        String hash = call.getString("sha256", "");
        Integer size = call.getInt("size");
        Integer code = call.getInt("versionCode");
        String url = call.getString("url", "");
        if (!hash.matches("[a-fA-F0-9]{64}") || size == null || size <= 0 || size > MAX_APK_BYTES || code == null || code <= 0 || !url.startsWith("https://github.com/SMAJORG/smajpihub/releases/download/")) {
            busy.set(false); call.reject("Verified update information is missing. Check for updates again.", "INVALID_UPDATE"); return;
        }
        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
            progress("permission", 0, size);
            pendingPermission = call;
            try { getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()))); }
            catch (Exception error) { pendingPermission = null; busy.set(false); call.reject("Allow SMAJ PI HUB to install updates in Android settings.", "INSTALL_PERMISSION"); }
            return;
        }
        download(call);
    }
    @Override protected void handleOnResume() {
        super.handleOnResume();
        if (pendingPermission == null) return;
        PluginCall call = pendingPermission; pendingPermission = null;
        if (Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls()) download(call);
        else { busy.set(false); call.reject("Allow SMAJ PI HUB to install updates, then try again.", "INSTALL_PERMISSION"); }
    }
    @Override protected void handleOnDestroy() {
        downloads.shutdownNow();
        super.handleOnDestroy();
    }
    private void progress(String stage, long received, long total) {
        JSObject event = new JSObject();
        event.put("stage", stage); event.put("received", received); event.put("total", total);
        notifyListeners("progress", event);
    }
    private void download(PluginCall call) {
        downloads.execute(() -> {
            File apk = new File(getContext().getCacheDir(), "smaj-verified-update-" + UUID.randomUUID() + ".apk");
            try {
                PackageInfo current = installed();
                long expectedCode = call.getInt("versionCode");
                if (expectedCode <= versionCode(current)) throw new UpdateFailure("This update is not newer than the installed app. Check again.", "VERSION_CHANGED");
                long expectedSize = call.getInt("size").longValue();
                MessageDigest hash = MessageDigest.getInstance("SHA-256");
                long received = 0;
                progress("downloading", 0, expectedSize);
                try (FileOutputStream output = new FileOutputStream(apk, false)) {
                    while (received < expectedSize) {
                        if (Thread.currentThread().isInterrupted()) throw new java.io.IOException("Update cancelled");
                        long end = Math.min(received + 4L * 1024 * 1024 - 1, expectedSize - 1);
                        byte[] chunk = null;
                        for (int attempt = 0; attempt < 3; attempt++) {
                            try { chunk = downloadChunk(call.getString("url"), received, end, expectedSize); break; }
                            catch (java.io.IOException error) { if (attempt == 2) throw error; }
                        }
                        hash.update(chunk); output.write(chunk); received += chunk.length;
                    }
                    output.getFD().sync();
                }
                progress("verifying", received, expectedSize);
                if (received != expectedSize || !hex(hash.digest()).equalsIgnoreCase(call.getString("sha256"))) throw new UpdateFailure("The update download is incomplete or damaged. Retry on a stable connection.", "DOWNLOAD_INVALID");
                PackageManager manager = getContext().getPackageManager();
                PackageInfo candidate = manager.getPackageArchiveInfo(apk.getAbsolutePath(), signingFlags());
                if (candidate == null || !current.packageName.equals(candidate.packageName) || versionCode(candidate) != expectedCode) throw new UpdateFailure("This file is not the expected SMAJ PI HUB update. Check again.", "PACKAGE_INVALID");
                if (!Arrays.equals(certificates(current), certificates(candidate))) throw new UpdateFailure("This installed copy uses a different signing key. Back up your local data and reinstall the official app once; future updates will keep the same key.", "SIGNATURE_MISMATCH");
                getBridge().executeOnMainThread(() -> {
                    try {
                        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        progress("installing", expectedSize, expectedSize);
                        getActivity().startActivity(intent);
                        JSObject result = new JSObject(); result.put("installerOpened", true); call.resolve(result);
                    } catch (Exception error) { apk.delete(); call.reject("Android could not open the update installer. Try again.", "INSTALL_UNAVAILABLE"); }
                    finally { busy.set(false); }
                });
            } catch (UpdateFailure error) { apk.delete(); busy.set(false); call.reject(error.getMessage(), error.code); }
            catch (Exception error) { apk.delete(); busy.set(false); call.reject("The update could not finish downloading. Check your connection and retry.", "DOWNLOAD_FAILED"); }
        });
    }
    private byte[] downloadChunk(String address, long start, long end, long total) throws Exception {
        HttpURLConnection connection = connect(address, start, end, total);
        byte[] bytes = new byte[(int) (end - start + 1)];
        try (InputStream input = connection.getInputStream()) {
            int received = 0;
            long lastProgress = 0;
            while (received < bytes.length) {
                int count = input.read(bytes, received, bytes.length - received);
                if (count < 0) throw new java.io.IOException("Incomplete update download");
                received += count;
                long now = android.os.SystemClock.elapsedRealtime();
                if (now - lastProgress >= 200 || received == bytes.length) {
                    progress("downloading", start + received, total); lastProgress = now;
                }
            }
            if (input.read() != -1) throw new UpdateFailure("The update download has an unexpected size.", "DOWNLOAD_INVALID");
            return bytes;
        } finally { connection.disconnect(); }
    }
    private HttpURLConnection connect(String address, long start, long end, long total) throws Exception {
        for (int redirect = 0; redirect < 8; redirect++) {
            URL url = new URL(address);
            String host = url.getHost();
            if (!"https".equals(url.getProtocol()) || !("github.com".equals(host) || "release-assets.githubusercontent.com".equals(host) || "objects.githubusercontent.com".equals(host))) throw new UpdateFailure("The update download address is not trusted.", "INVALID_URL");
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(20000); connection.setReadTimeout(45000); connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept-Encoding", "identity");
            connection.setRequestProperty("Range", "bytes=" + start + "-" + end);
            int status = connection.getResponseCode();
            if (status >= 300 && status <= 399) { String location = connection.getHeaderField("Location"); connection.disconnect(); if (location == null) break; address = new URL(url, location).toString(); continue; }
            if (status != 206) { connection.disconnect(); throw new UpdateFailure("The update download is unavailable. Check again shortly.", "DOWNLOAD_UNAVAILABLE"); }
            if (!("bytes " + start + "-" + end + "/" + total).equals(connection.getHeaderField("Content-Range"))) {
                connection.disconnect(); throw new UpdateFailure("The update changed during download. Check again.", "DOWNLOAD_CHANGED");
            }
            return connection;
        }
        throw new UpdateFailure("The update download redirected too many times.", "INVALID_URL");
    }
    private PackageInfo installed() throws Exception { return getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), signingFlags()); }
    private int signingFlags() { return Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES; }
    private long versionCode(PackageInfo info) { return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode; }
    private String[] certificates(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28 && info.signingInfo != null ? info.signingInfo.getApkContentsSigners() : info.signatures;
        if (signatures == null || signatures.length == 0) throw new UpdateFailure("The update signing certificate is missing.", "SIGNATURE_MISSING");
        String[] hashes = new String[signatures.length];
        for (int i = 0; i < signatures.length; i++) hashes[i] = hex(MessageDigest.getInstance("SHA-256").digest(signatures[i].toByteArray()));
        Arrays.sort(hashes); return hashes;
    }
    private String hex(byte[] bytes) { StringBuilder result = new StringBuilder(); for (byte value : bytes) result.append(String.format("%02x", value & 255)); return result.toString(); }
    private static class UpdateFailure extends Exception { final String code; UpdateFailure(String message, String code) { super(message); this.code = code; } }
}

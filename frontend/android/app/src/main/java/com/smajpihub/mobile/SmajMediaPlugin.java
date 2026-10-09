package com.smajpihub.mobile;

import android.content.pm.ActivityInfo;
import android.app.DownloadManager;
import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.InputStream;
import java.io.OutputStream;
import android.os.Build;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SmajMedia")
public class SmajMediaPlugin extends Plugin {
    @PluginMethod public void enterLandscape(PluginCall call) {
        getActivity().runOnUiThread(() -> { getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE); hideSystemBars(); call.resolve(); });
    }
    @PluginMethod public void exitLandscape(PluginCall call) {
        getActivity().runOnUiThread(() -> { getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED); showSystemBars(); call.resolve(); });
    }
    @PluginMethod public void enterPictureInPicture(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { call.reject("Picture-in-Picture requires Android 8 or newer."); return; }
        getActivity().runOnUiThread(() -> {
            try {
                MainActivity activity = (MainActivity) getActivity();
                activity.preparePictureInPicture(() -> {
                    try {
                        boolean entered = activity.enterPictureInPictureMode(activity.pipParams(call.getBoolean("playing", true)));
                        if (!entered) activity.updatePipUi(false);
                        JSObject result = new JSObject(); result.put("entered", entered); call.resolve(result);
                    } catch (IllegalStateException | IllegalArgumentException error) {
                        activity.updatePipUi(false); call.reject("Android could not enter Picture-in-Picture mode.", error);
                    }
                });
            } catch (IllegalStateException | IllegalArgumentException error) {
                call.reject("Android could not enter Picture-in-Picture mode.", error);
            }
        });
    }
    @PluginMethod public void startDownload(PluginCall call) {
        String url = call.getString("url", "");
        String title = call.getString("title", "SMAJ Stream video");
        String fileName = call.getString("fileName", "smaj-video.mp4").replaceAll("[^a-zA-Z0-9._-]", "_");
        String location = call.getString("location", "app");
        if (!url.startsWith("https://")) { call.reject("A secure download URL is required."); return; }
        try {
            if ("app".equals(location)) {
                long id = StreamDownloadService.create(getContext(), url, title);
                JSObject result = new JSObject(); result.put("downloadId", id); call.resolve(result); return;
            }
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle(title).setDescription("Downloading in SMAJ Stream").setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED).setAllowedOverMetered(true).setAllowedOverRoaming(false);
            if ("downloads".equals(location)) request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "SMAJ/" + fileName);
            else request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_MOVIES, fileName);
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            long id = manager.enqueue(request);
            JSObject result = new JSObject(); result.put("downloadId", id); call.resolve(result);
        } catch (Exception error) { call.reject("The Android download could not start.", error); }
    }
    @PluginMethod public void deleteDownload(PluginCall call) {
        Long id = readDownloadId(call);
        if (id == null || id < 1) { call.reject("A valid download id is required."); return; }
        try {
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (StreamDownloadService.owns(getContext(), id)) StreamDownloadService.delete(getContext(), id);
            else manager.remove(id);
            JSObject result = new JSObject(); result.put("deleted", true); call.resolve(result);
        } catch (Exception error) { call.reject("The downloaded video could not be deleted.", error); }
    }
    @PluginMethod public void getDownloadStatus(PluginCall call) {
        Long id = readDownloadId(call);
        if (id == null) { call.reject("Download id is required."); return; }
        if (StreamDownloadService.owns(getContext(), id)) {
            try {
                org.json.JSONObject record = StreamDownloadService.read(getContext(), id);
                JSObject result = new JSObject();
                long downloaded = record.optLong("downloadedBytes"), total = record.optLong("totalBytes");
                result.put("status", record.optString("status")); result.put("downloadedBytes", downloaded); result.put("totalBytes", total);
                result.put("progress", "complete".equals(record.optString("status")) ? 100 : total > 0 ? Math.min(100, Math.round(downloaded * 100f / total)) : 0);
                result.put("canPause", true); result.put("reason", record.optInt("reason"));
                if ("complete".equals(record.optString("status"))) result.put("localUri", Uri.fromFile(StreamDownloadService.file(getContext(), id)).toString());
                call.resolve(result);
            } catch (Exception error) { call.reject("Download progress is unavailable.", error); }
            return;
        }
        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
            if (!cursor.moveToFirst()) { call.reject("Download was not found."); return; }
            int androidStatus = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            String status = androidStatus == DownloadManager.STATUS_SUCCESSFUL ? "complete" : androidStatus == DownloadManager.STATUS_FAILED ? "failed" : androidStatus == DownloadManager.STATUS_PAUSED ? "paused" : androidStatus == DownloadManager.STATUS_RUNNING ? "running" : "pending";
            JSObject result = new JSObject(); result.put("status", status); result.put("downloadedBytes", downloaded); result.put("totalBytes", total); result.put("progress", total > 0 ? Math.min(100, Math.round(downloaded * 100f / total)) : 0);
            int uriColumn = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI); if (uriColumn >= 0) result.put("localUri", cursor.getString(uriColumn));
            int reasonColumn = cursor.getColumnIndex(DownloadManager.COLUMN_REASON); if (reasonColumn >= 0) result.put("reason", cursor.getInt(reasonColumn));
            call.resolve(result);
        } catch (Exception error) { call.reject("Download progress is unavailable.", error); }
    }
    @PluginMethod public void saveDownloadToPhone(PluginCall call) {
        Long id = readDownloadId(call);
        String fileName = call.getString("fileName", "smaj-video.mp4").replaceAll("[^a-zA-Z0-9._-]", "_");
        if (id == null) { call.reject("Download id is required."); return; }
        new Thread(() -> {
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            boolean managed = StreamDownloadService.owns(getContext(), id);
            Uri source = managed ? Uri.fromFile(StreamDownloadService.file(getContext(), id)) : manager.getUriForDownloadedFile(id);
            try { if (managed && !"complete".equals(StreamDownloadService.read(getContext(), id).optString("status"))) { call.reject("Finish downloading before saving."); return; } }
            catch (Exception error) { call.reject("Download was not found.", error); return; }
            if (source == null) { call.reject("The downloaded movie file was not found."); return; }
            long total = managed ? StreamDownloadService.file(getContext(), id).length() : 0;
            if (!managed) try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
                if (cursor.moveToFirst()) total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            }
            try {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Video.Media.DISPLAY_NAME, fileName);
                values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/SMAJ"); values.put(MediaStore.Video.Media.IS_PENDING, 1); }
                Uri destination = getContext().getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
                if (destination == null) throw new IllegalStateException("Phone storage is unavailable.");
                long copied = 0; byte[] buffer = new byte[1024 * 1024]; int read;
                try (InputStream input = getContext().getContentResolver().openInputStream(source); OutputStream output = getContext().getContentResolver().openOutputStream(destination)) {
                    if (input == null || output == null) throw new IllegalStateException("The movie file could not be opened.");
                    while ((read = input.read(buffer)) != -1) { output.write(buffer, 0, read); copied += read; JSObject progress = new JSObject(); progress.put("progress", total > 0 ? Math.min(100, Math.round(copied * 100f / total)) : 0); notifyListeners("saveProgress", progress); }
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { ContentValues ready = new ContentValues(); ready.put(MediaStore.Video.Media.IS_PENDING, 0); getContext().getContentResolver().update(destination, ready, null, null); }
                JSObject result = new JSObject(); result.put("saved", true); result.put("uri", destination.toString()); call.resolve(result);
            } catch (Exception error) { call.reject("The movie could not be saved to phone storage.", error); }
        }).start();
    }
    @PluginMethod public void setPictureInPicturePlaying(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= 26 && getActivity().isInPictureInPictureMode()) getActivity().setPictureInPictureParams(((MainActivity) getActivity()).pipParams(call.getBoolean("playing", true)));
            call.resolve();
        });
    }
    @PluginMethod public void pauseDownload(PluginCall call) { changeDownload(call, true); }
    @PluginMethod public void resumeDownload(PluginCall call) { changeDownload(call, false); }
    private void changeDownload(PluginCall call, boolean pause) {
        Long id = readDownloadId(call);
        if (id == null || !StreamDownloadService.owns(getContext(), id)) { call.reject("Pause is available for new app downloads. Existing Android downloads continue normally."); return; }
        new Thread(() -> {
            try { if (pause) StreamDownloadService.pause(getContext(), id); else StreamDownloadService.resume(getContext(), id); call.resolve(); }
            catch (Exception error) { call.reject("Could not " + (pause ? "pause" : "continue") + " this download.", error); }
        }).start();
    }
    private Long readDownloadId(PluginCall call) {
        Object raw = call.getData().opt("downloadId");
        if (raw instanceof Number) return ((Number) raw).longValue();
        if (raw instanceof String) {
            try { return Long.parseLong((String) raw); }
            catch (NumberFormatException ignored) { return null; }
        }
        return null;
    }    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getActivity().getWindow().getInsetsController();
            if (controller != null) { controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars()); controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else getActivity().getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
    private void showSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) { WindowInsetsController controller = getActivity().getWindow().getInsetsController(); if (controller != null) controller.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars()); }
        else getActivity().getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
    }
}

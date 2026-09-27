package com.smajpihub.mobile;

import android.app.PictureInPictureParams;
import android.content.pm.ActivityInfo;
import android.app.DownloadManager;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.os.Build;
import android.util.Rational;
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
                PictureInPictureParams params = new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build();
                boolean entered = getActivity().enterPictureInPictureMode(params);
                JSObject result = new JSObject(); result.put("entered", entered); call.resolve(result);
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
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle(title).setDescription("Downloading in SMAJ Stream").setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED).setAllowedOverMetered(true).setAllowedOverRoaming(false);
            if ("downloads".equals(location)) request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "SMAJ/" + fileName);
            else request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_MOVIES, fileName);
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            long id = manager.enqueue(request);
            JSObject result = new JSObject(); result.put("downloadId", id); call.resolve(result);
        } catch (Exception error) { call.reject("The Android download could not start.", error); }
    }
    @PluginMethod public void getDownloadStatus(PluginCall call) {
        Long id = call.getLong("downloadId");
        if (id == null) { call.reject("Download id is required."); return; }
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

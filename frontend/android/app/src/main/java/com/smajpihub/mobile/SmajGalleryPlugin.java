package com.smajpihub.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Size;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "SmajGallery", permissions = {
    @Permission(alias = "media", strings = { Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO }),
    @Permission(alias = "selected", strings = { Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED }),
    @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
})
public class SmajGalleryPlugin extends Plugin {
    private final Set<String> offered = ConcurrentHashMap.newKeySet();
    private boolean granted(String permission) { return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED; }
    private boolean selectedAccess() { return Build.VERSION.SDK_INT >= 34 && granted(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED); }
    private boolean canRead(boolean video) {
        if (Build.VERSION.SDK_INT < 33) return granted(Manifest.permission.READ_EXTERNAL_STORAGE);
        return granted(video ? Manifest.permission.READ_MEDIA_VIDEO : Manifest.permission.READ_MEDIA_IMAGES) || selectedAccess();
    }
    @PluginMethod public void albums(PluginCall call) {
        if (canRead(false) || canRead(true)) { loadAlbums(call); return; }
        String[] aliases = Build.VERSION.SDK_INT >= 34 ? new String[]{"media", "selected"} : Build.VERSION.SDK_INT >= 33 ? new String[]{"media"} : new String[]{"storage"};
        requestPermissionForAliases(aliases, call, "libraryPermission");
    }
    @PermissionCallback private void libraryPermission(PluginCall call) {
        if (canRead(false) || canRead(true)) loadAlbums(call);
        else call.reject("Allow photo access or use Open in to choose a file.");
    }
    private static class Item {
        Uri uri; String album, albumName, name, mime; long time, size, duration; boolean video;
    }
    private List<Item> library() {
        List<Item> items = new ArrayList<>();
        for (boolean video : new boolean[]{false, true}) {
            if (!canRead(video)) continue;
            Uri collection = video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            String[] projection = video ? new String[]{"_id", "bucket_id", "bucket_display_name", "_display_name", "mime_type", "_size", "date_added", "duration"} : new String[]{"_id", "bucket_id", "bucket_display_name", "_display_name", "mime_type", "_size", "date_added"};
            try (Cursor cursor = getContext().getContentResolver().query(collection, projection, null, null, "date_added DESC, _id DESC")) {
                if (cursor == null) continue;
                while (cursor.moveToNext()) {
                    Item item = new Item(); item.uri = ContentUris.withAppendedId(collection, cursor.getLong(0));
                    item.album = "bucket:" + cursor.getString(1); item.albumName = cursor.getString(2);
                    item.name = cursor.getString(3); item.mime = cursor.getString(4); item.size = cursor.getLong(5); item.time = cursor.getLong(6);
                    item.video = video; item.duration = video ? cursor.getLong(7) : 0; items.add(item);
                }
            } catch (SecurityException denied) { /* Access may change while a partial-access gallery is open. */ }
        }
        items.sort(Comparator.comparingLong((Item item) -> item.time).reversed());
        return items;
    }
    private String thumbnail(Item item) {
        Bitmap bitmap = null;
        try {
            if (Build.VERSION.SDK_INT >= 29) bitmap = getContext().getContentResolver().loadThumbnail(item.uri, new Size(180, 180), null);
            else {
                long id = ContentUris.parseId(item.uri);
                bitmap = item.video ? MediaStore.Video.Thumbnails.getThumbnail(getContext().getContentResolver(), id, MediaStore.Video.Thumbnails.MINI_KIND, null) : MediaStore.Images.Thumbnails.getThumbnail(getContext().getContentResolver(), id, MediaStore.Images.Thumbnails.MINI_KIND, null);
            }
            if (bitmap == null) return "";
            Bitmap scaled = Bitmap.createScaledBitmap(bitmap, 180, Math.max(1, bitmap.getHeight() * 180 / Math.max(1, bitmap.getWidth())), true);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); scaled.compress(Bitmap.CompressFormat.JPEG, 65, bytes);
            if (scaled != bitmap) scaled.recycle();
            return "data:image/jpeg;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) { return ""; } finally { if (bitmap != null) bitmap.recycle(); }
    }
    private JSObject album(String id, String name, List<Item> items) {
        JSObject value = new JSObject(); value.put("id", id); value.put("name", name); value.put("count", items.size());
        value.put("thumbnail", items.isEmpty() ? "" : thumbnail(items.get(0))); return value;
    }
    private void loadAlbums(PluginCall call) {
        execute(() -> {
            try {
                List<Item> items = library(); JSArray result = new JSArray(); result.put(album("all", "All media", items));
                List<Item> videos = new ArrayList<>(); Map<String, List<Item>> groups = new LinkedHashMap<>();
                for (Item item : items) { if (item.video) videos.add(item); groups.computeIfAbsent(item.album, key -> new ArrayList<>()).add(item); }
                if (!videos.isEmpty()) result.put(album("videos", "All videos", videos));
                for (Map.Entry<String, List<Item>> group : groups.entrySet()) {
                    String name = group.getValue().get(0).albumName;
                    result.put(album(group.getKey(), name == null ? "Pictures" : name, group.getValue()));
                }
                JSObject response = new JSObject(); response.put("albums", result);
                response.put("limited", Build.VERSION.SDK_INT >= 33 && (!granted(Manifest.permission.READ_MEDIA_IMAGES) || !granted(Manifest.permission.READ_MEDIA_VIDEO)));
                call.resolve(response);
            } catch (Exception error) { call.reject("Could not read the gallery. Try Open in.", error); }
        });
    }
    @PluginMethod public void media(PluginCall call) {
        if (!canRead(false) && !canRead(true)) { call.reject("Photo access is not available. Try Open in."); return; }
        execute(() -> {
            try {
                String album = call.getString("album", "all"); int offset = Math.max(0, call.getInt("offset", 0)); int limit = Math.min(48, Math.max(1, call.getInt("limit", 36)));
                List<Item> matches = new ArrayList<>();
                for (Item item : library()) if ("all".equals(album) || ("videos".equals(album) && item.video) || item.album.equals(album)) matches.add(item);
                JSArray items = new JSArray();
                for (int index = offset; index < Math.min(matches.size(), offset + limit); index++) {
                    Item item = matches.get(index); JSObject value = new JSObject(); offered.add(item.uri.toString());
                    value.put("id", item.uri.toString()); value.put("name", item.name); value.put("mimeType", item.mime); value.put("size", item.size);
                    value.put("duration", item.duration / 1000); value.put("thumbnail", thumbnail(item)); items.put(value);
                }
                JSObject response = new JSObject(); response.put("items", items); response.put("hasMore", offset + limit < matches.size()); call.resolve(response);
            } catch (Exception error) { call.reject("Could not load gallery photos. Try Open in.", error); }
        });
    }
    @PluginMethod public void read(PluginCall call) {
        String id = call.getString("id", "");
        if (!offered.contains(id)) { call.reject("Select a file from the gallery first."); return; }
        execute(() -> { try { call.resolve(readUri(Uri.parse(id))); } catch (Exception error) { call.reject(error.getMessage(), error); } });
    }
    @PluginMethod public void openPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
        try { startActivityForResult(call, Intent.createChooser(intent, "Open in..."), "picked"); }
        catch (Exception error) { call.reject("No gallery app is available.", error); }
    }
    @ActivityCallback private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject response = new JSObject(); response.put("cancelled", true); call.resolve(response); return;
        }
        Uri uri = result.getData().getData();
        execute(() -> { try { call.resolve(readUri(uri)); } catch (Exception error) { call.reject(error.getMessage(), error); } });
    }
    private JSObject readUri(Uri uri) throws Exception {
        if (!"content".equals(uri.getScheme())) throw new Exception("Choose a photo or video from your device.");
        String mime = getContext().getContentResolver().getType(uri);
        if (mime == null || (!mime.startsWith("image/") && !mime.startsWith("video/"))) throw new Exception("Choose an image or video.");
        int limit = mime.startsWith("video/") ? 2500000 : 2097152;
        String name = mime.startsWith("video/") ? "video.mp4" : "photo.jpg";
        try (Cursor cursor = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                name = cursor.getString(0);
                if (!cursor.isNull(1) && cursor.getLong(1) > limit) throw new Exception(mime.startsWith("video/") ? "Choose a video smaller than 2.5 MB." : "Choose a photo smaller than 2 MB.");
            }
        }
        try (InputStream input = getContext().getContentResolver().openInputStream(uri); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            if (input == null) throw new Exception("This file is no longer available.");
            byte[] buffer = new byte[8192]; int read;
            while ((read = input.read(buffer)) != -1) { if (bytes.size() + read > limit) throw new Exception("The selected file is too large for chat."); bytes.write(buffer, 0, read); }
            JSObject response = new JSObject(); response.put("name", name); response.put("mimeType", mime);
            response.put("dataUrl", "data:" + mime + ";base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)); return response;
        }
    }
}

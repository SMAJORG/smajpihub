package com.smajpihub.mobile;

import android.app.*;
import android.content.*;
import android.os.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.util.concurrent.ConcurrentHashMap;

/** Resumable app-private transfers. Legacy DownloadManager records stay supported. */
public class StreamDownloadService extends Service {
    private static final String STORE = "stream-resumable-downloads";
    private static final ConcurrentHashMap<Long, Transfer> active = new ConcurrentHashMap<>();
    private static class Transfer { volatile boolean paused; volatile HttpURLConnection connection; Thread thread; }
    static boolean owns(Context c, long id) { return c.getSharedPreferences(STORE, 0).contains("" + id); }
    private static synchronized void save(Context c, long id, JSONObject r) { c.getSharedPreferences(STORE, 0).edit().putString("" + id, r.toString()).commit(); }
    static synchronized JSONObject read(Context c, long id) throws Exception {
        String raw = c.getSharedPreferences(STORE, 0).getString("" + id, null);
        if (raw == null) throw new IllegalStateException("Download was not found.");
        JSONObject r = new JSONObject(raw);
        if ("running".equals(r.optString("status")) && !active.containsKey(id)) { r.put("status", "paused"); save(c, id, r); }
        return r;
    }
    static File file(Context c, long id) {
        File dir = c.getExternalFilesDir(android.os.Environment.DIRECTORY_MOVIES);
        return new File(dir != null ? dir : c.getFilesDir(), "stream-" + id + ".mp4");
    }
    static synchronized long create(Context c, String url, String title) throws Exception {
        long id = System.currentTimeMillis(); while (owns(c, id)) id++;
        save(c, id, new JSONObject().put("url", url).put("title", title).put("status", "paused").put("downloadedBytes", 0).put("totalBytes", 0));
        resume(c, id); return id;
    }
    static void resume(Context c, long id) throws Exception {
        JSONObject record = read(c, id);
        if ("complete".equals(record.optString("status"))) return;
        if (record.optLong("totalBytes") > 0 && file(c, id).length() == record.optLong("totalBytes")) {
            record.put("status", "complete").put("downloadedBytes", file(c, id).length()); save(c, id, record); return;
        }
        if (active.containsKey(id)) return;
        record.put("status", "pending"); save(c, id, record);
        Intent intent = new Intent(c, StreamDownloadService.class).putExtra("downloadId", id);
        try { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(intent); else c.startService(intent); }
        catch (RuntimeException error) { record.put("status", "paused"); save(c, id, record); throw error; }
    }
    static void pause(Context c, long id) throws Exception {
        Transfer t = active.get(id);
        if (t != null) {
            t.paused = true; if (t.connection != null) t.connection.disconnect(); t.thread.join(15000);
            if (t.thread.isAlive()) throw new IllegalStateException("Still pausing. Try again shortly.");
        }
        JSONObject r = read(c, id);
        if (!"complete".equals(r.optString("status"))) { r.put("status", "paused"); save(c, id, r); }
    }
    static void delete(Context c, long id) throws Exception {
        pause(c, id); File f = file(c, id);
        if (f.exists() && !f.delete()) throw new IOException("Could not delete download.");
        c.getSharedPreferences(STORE, 0).edit().remove("" + id).commit();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel("stream-downloads", "Stream downloads", NotificationManager.IMPORTANCE_LOW));
        Notification.Builder n = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, "stream-downloads") : new Notification.Builder(this);
        startForeground(2401, n.setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle("SMAJ Stream").setContentText("Downloading videos. Pause or continue in Downloads.").setOngoing(true).build());
        long id = intent != null ? intent.getLongExtra("downloadId", 0) : 0;
        if (id < 1 || active.containsKey(id)) { if (active.isEmpty()) stopSelf(); return START_NOT_STICKY; }
        try { if (!"pending".equals(read(this, id).optString("status"))) { if (active.isEmpty()) stopSelf(); return START_NOT_STICKY; } } catch (Exception error) { if (active.isEmpty()) stopSelf(); return START_NOT_STICKY; }
        Transfer t = new Transfer(); t.thread = new Thread(() -> transfer(id, t), "stream-download-" + id); active.put(id, t); t.thread.start();
        return START_NOT_STICKY;
    }
    private void transfer(long id, Transfer t) {
        JSONObject r = null;
        try {
            r = read(this, id); r.put("status", "running"); save(this, id, r);
            File target = file(this, id); long offset = target.length();
            HttpURLConnection connection = (HttpURLConnection) new URL(r.getString("url")).openConnection(); t.connection = connection;
            connection.setConnectTimeout(15000); connection.setReadTimeout(10000); connection.setRequestProperty("Accept-Encoding", "identity");
            if (offset > 0 && !r.optString("validator").isEmpty()) { connection.setRequestProperty("Range", "bytes=" + offset + "-"); connection.setRequestProperty("If-Range", r.getString("validator")); }
            int code = connection.getResponseCode();
            if (!"https".equalsIgnoreCase(connection.getURL().getProtocol())) throw new IOException("Insecure redirect.");
            if (code != 200 && code != 206) throw new IOException("Download HTTP " + code);
            if (code == 206 && !String.valueOf(connection.getHeaderField("Content-Range")).startsWith("bytes " + offset + "-")) throw new IOException("Invalid resume range.");
            if (code == 200) offset = 0; // Changed file or no range support: safely restart.
            long length = connection.getContentLengthLong(); long total = length >= 0 ? offset + length : 0;
            String validator = connection.getHeaderField("ETag");
            if (validator == null || validator.startsWith("W/")) validator = connection.getHeaderField("Last-Modified");
            r.put("validator", validator == null ? "" : validator).put("totalBytes", total);
            try (InputStream in = connection.getInputStream(); RandomAccessFile out = new RandomAccessFile(target, "rw")) {
                out.setLength(offset); out.seek(offset); byte[] buffer = new byte[65536]; int count; long lastSave = 0;
                while (!t.paused && (count = in.read(buffer)) != -1) {
                    if (t.paused) break;
                    out.write(buffer, 0, count); offset += count; r.put("downloadedBytes", offset);
                    if (System.currentTimeMillis() - lastSave > 800) { save(this, id, r); lastSave = System.currentTimeMillis(); }
                }
                if (!t.paused && total > 0 && offset != total) throw new IOException("Incomplete download.");
                r.put("status", t.paused ? "paused" : "complete");
            }
        } catch (Exception error) { if (r != null) try { r.put("status", t.paused ? "paused" : "failed").put("reason", 1); } catch (Exception ignored) { } }
        finally { if (r != null) save(this, id, r); if (t.connection != null) t.connection.disconnect(); active.remove(id); new Handler(Looper.getMainLooper()).post(() -> { if (active.isEmpty()) stopSelf(); }); }
    }
    @Override public void onTimeout(int startId, int foregroundServiceType) { for (Transfer t : active.values()) { t.paused = true; if (t.connection != null) t.connection.disconnect(); } stopSelf(); }
    @Override public void onDestroy() { for (Transfer t : active.values()) { t.paused = true; if (t.connection != null) t.connection.disconnect(); } super.onDestroy(); }
}

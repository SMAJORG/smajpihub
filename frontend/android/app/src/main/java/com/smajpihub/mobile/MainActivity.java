package com.smajpihub.mobile;

import android.os.Bundle;
import android.os.Build;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.app.PendingIntent;
import android.content.*;
import android.content.res.Configuration;
import android.graphics.drawable.Icon;
import android.util.Rational;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Arrays;

public class MainActivity extends BridgeActivity {
    private final BroadcastReceiver pipReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            String action = intent.getStringExtra("control");
            if (!Arrays.asList("toggle", "back", "forward").contains(action)) return;
            bridge.getWebView().evaluateJavascript("window.dispatchEvent(new CustomEvent('smaj:pip-action',{detail:'" + action + "'}))", null);
        }
    };
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmajPermissionsPlugin.class);
        registerPlugin(SmajMediaPlugin.class);
        super.onCreate(savedInstanceState);
        bridge.getWebView().setWebChromeClient(new SmajWebChromeClient(bridge));
        bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        ContextCompat.registerReceiver(this, pipReceiver, new IntentFilter(getPackageName() + ".PIP_CONTROL"), ContextCompat.RECEIVER_NOT_EXPORTED);
    }
    @android.annotation.TargetApi(Build.VERSION_CODES.O)
    public PictureInPictureParams pipParams(boolean playing) {
        return new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).setActions(Arrays.asList(
            pipAction("back", "Back 10 seconds", android.R.drawable.ic_media_rew, 1),
            pipAction("toggle", playing ? "Pause" : "Play", playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, 2),
            pipAction("forward", "Forward 10 seconds", android.R.drawable.ic_media_ff, 3))).build();
    }
    @android.annotation.TargetApi(Build.VERSION_CODES.O)
    private RemoteAction pipAction(String control, String title, int icon, int code) {
        Intent intent = new Intent(getPackageName() + ".PIP_CONTROL").setPackage(getPackageName()).putExtra("control", control);
        PendingIntent pending = PendingIntent.getBroadcast(this, code, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new RemoteAction(Icon.createWithResource(this, icon), title, title, pending);
    }
    public void preparePictureInPicture(Runnable enter) {
        bridge.getWebView().evaluateJavascript("document.documentElement.classList.add('smaj-native-pip')", result -> bridge.getWebView().postDelayed(enter, 80));
    }
    public void updatePipUi(boolean active) {
        if (bridge != null) bridge.getWebView().evaluateJavascript("document.documentElement.classList." + (active ? "add" : "remove") + "('smaj-native-pip')", null);
    }
    @android.annotation.TargetApi(Build.VERSION_CODES.O)
    @Override public void onPictureInPictureModeChanged(boolean active, Configuration configuration) {
        super.onPictureInPictureModeChanged(active, configuration);
        updatePipUi(active);
    }
    @Override public void onStop() {
        super.onStop();
        if (bridge != null) bridge.getWebView().evaluateJavascript("document.querySelector('.sw-pip-target video')?.pause()", null);
    }
    @Override public void onDestroy() { unregisterReceiver(pipReceiver); super.onDestroy(); }
}

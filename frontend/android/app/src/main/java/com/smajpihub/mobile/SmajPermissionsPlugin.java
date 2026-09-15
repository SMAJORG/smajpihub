package com.smajpihub.mobile;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Locale;

@CapacitorPlugin(
    name = "SmajPermissions",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "media", strings = {
            Manifest.permission.READ_MEDIA_IMAGES,
            Manifest.permission.READ_MEDIA_VIDEO
        }),
        @Permission(alias = "legacyMedia", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class SmajPermissionsPlugin extends Plugin {
    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        requestPermissionForAlias("microphone", call, "microphoneCallback");
    }

    @PermissionCallback
    private void microphoneCallback(PluginCall call) {
        resolvePermission(call, "microphone");
    }

    @PluginMethod
    public void requestMedia(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("media", call, "mediaCallback");
        } else {
            requestPermissionForAlias("legacyMedia", call, "legacyMediaCallback");
        }
    }

    @PermissionCallback
    private void mediaCallback(PluginCall call) {
        resolvePermission(call, "media");
    }

    @PermissionCallback
    private void legacyMediaCallback(PluginCall call) {
        resolvePermission(call, "legacyMedia");
    }

    private void resolvePermission(PluginCall call, String alias) {
        JSObject result = new JSObject();
        result.put("state", getPermissionState(alias).toString().toLowerCase(Locale.ROOT));
        call.resolve(result);
    }
}
package com.smajpihub.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmajPermissionsPlugin.class);
        registerPlugin(SmajMediaPlugin.class);
        super.onCreate(savedInstanceState);
        bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
    }
}

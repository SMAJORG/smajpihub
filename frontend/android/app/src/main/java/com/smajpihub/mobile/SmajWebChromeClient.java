package com.smajpihub.mobile;

import android.view.View;
import android.webkit.WebChromeClient;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/** Routes provider-initiated video fullscreen through the SMAJ player UI. */
public class SmajWebChromeClient extends BridgeWebChromeClient {
    private final Bridge bridge;

    public SmajWebChromeClient(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onShowCustomView(View view, WebChromeClient.CustomViewCallback callback) {
        callback.onCustomViewHidden();
        bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('smaj:native-fullscreen-request'))",
            null
        ));
    }
}
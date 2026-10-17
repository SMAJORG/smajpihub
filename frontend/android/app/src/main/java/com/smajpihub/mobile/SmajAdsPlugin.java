package com.smajpihub.mobile;

import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.*;
import com.google.android.gms.ads.nativead.*;
import com.google.android.gms.ads.rewarded.*;
import com.google.android.ump.*;

/** Test-only bridge. IDs cannot be supplied by JavaScript or remote configuration. */
@CapacitorPlugin(name = "SmajAds")
public class SmajAdsPlugin extends Plugin {
    private static final String BANNER = "ca-app-pub-3940256099942544/6300978111";
    private static final String NATIVE = "ca-app-pub-3940256099942544/2247696110";
    private static final String REWARDED = "ca-app-pub-3940256099942544/5224354917";
    private ConsentInformation consent;
    private boolean consentUpdated, initialized, enabled, rewardBusy;
    private LinearLayout dock;
    private AdView banner;
    private NativeAd nativeAd;
    private int generation;
    private boolean loaded, slotVisible;

    @Override public void load() { consent = UserMessagingPlatform.getConsentInformation(getContext()); }
    private boolean optedIn() { return getContext().getSharedPreferences("smaj_ads", 0).getBoolean("allowed", false); }
    private JSObject state() {
        JSObject result = new JSObject();
        result.put("allowed", optedIn());
        result.put("canRequestAds", consentUpdated && consent.canRequestAds());
        result.put("privacyRequired", consent.getPrivacyOptionsRequirementStatus() == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED);
        return result;
    }
    @PluginMethod public void status(PluginCall call) { getActivity().runOnUiThread(() -> call.resolve(state())); }
    @PluginMethod public void refresh(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!optedIn()) { call.resolve(state()); return; }
            consent.requestConsentInfoUpdate(getActivity(), new ConsentRequestParameters.Builder().build(),
                () -> { consentUpdated = true; call.resolve(state()); },
                error -> { consentUpdated = false; call.resolve(state()); });
        });
    }
    @PluginMethod public void consent(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            boolean allow = Boolean.TRUE.equals(call.getBoolean("allowed", false));
            getContext().getSharedPreferences("smaj_ads", 0).edit().putBoolean("allowed", allow).apply();
            clear();
            if (!allow) { enabled = false; call.resolve(state()); return; }
            consent.requestConsentInfoUpdate(getActivity(), new ConsentRequestParameters.Builder().build(), () -> {
                consentUpdated = true;
                UserMessagingPlatform.loadAndShowConsentFormIfRequired(getActivity(), error -> {
                    if (error != null) { consentUpdated = false; call.reject(error.getMessage()); }
                    else call.resolve(state());
                });
            }, error -> { consentUpdated = false; call.reject(error.getMessage()); });
        });
    }
    @PluginMethod public void privacy(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            clear();
            if (consent.getPrivacyOptionsRequirementStatus() != ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED) {
                call.resolve(state()); return;
            }
            UserMessagingPlatform.showPrivacyOptionsForm(getActivity(), error -> {
                if (error != null) call.reject(error.getMessage()); else call.resolve(state());
            });
        });
    }
    private boolean ready() { return enabled && optedIn() && consentUpdated && consent.canRequestAds(); }
    private void initialize(Runnable next) {
        if (initialized) { next.run(); return; }
        new Thread(() -> MobileAds.initialize(getContext(), result ->
            getActivity().runOnUiThread(() -> { initialized = true; next.run(); })), "smaj-ads-init").start();
    }
    private int dp(int value) { return Math.round(value * getContext().getResources().getDisplayMetrics().density); }
    private void ensureDock() {
        if (dock != null) return;
        // Native rendering is restricted to an empty, reserved HTML slot.
        // The WebView and its bottom navigation retain their existing layout.
        ViewGroup root = getActivity().findViewById(android.R.id.content);
        dock = new LinearLayout(getContext()); dock.setOrientation(LinearLayout.VERTICAL);
        dock.setGravity(android.view.Gravity.CENTER); dock.setBackgroundColor(0xfff8fafc);
        dock.setVisibility(View.GONE);
        root.addView(dock, new FrameLayout.LayoutParams(-1, -2));
    }
    private void clear() {
        generation++;
        loaded = false; slotVisible = false;
        if (banner != null) { banner.destroy(); banner = null; }
        if (nativeAd != null) { nativeAd.destroy(); nativeAd = null; }
        if (dock != null) { dock.removeAllViews(); dock.setVisibility(View.GONE); }
    }
    @PluginMethod public void hide(PluginCall call) {
        getActivity().runOnUiThread(() -> { enabled = false; clear(); call.resolve(); });
    }
    @PluginMethod public void position(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (dock == null) { call.resolve(); return; }
            slotVisible = Boolean.TRUE.equals(call.getBoolean("visible", false));
            double viewportWidth = call.getDouble("viewportWidth", 0.0);
            if (viewportWidth <= 0) slotVisible = false;
            if (slotVisible) {
                double scale = getBridge().getWebView().getWidth() / viewportWidth;
                int[] web = new int[2], root = new int[2];
                getBridge().getWebView().getLocationOnScreen(web);
                ((View) dock.getParent()).getLocationOnScreen(root);
                FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                    (int)Math.round(call.getDouble("width", 0.0) * scale),
                    (int)Math.round(call.getDouble("height", 0.0) * scale));
                params.leftMargin = web[0] - root[0] + (int)Math.round(call.getDouble("left", 0.0) * scale);
                params.topMargin = web[1] - root[1] + (int)Math.round(call.getDouble("top", 0.0) * scale);
                dock.setLayoutParams(params);
            }
            dock.setVisibility(loaded && slotVisible && ready() ? View.VISIBLE : View.GONE);
            call.resolve();
        });
    }
    @PluginMethod public void show(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            clear(); enabled = true;
            String format = call.getString("format", "");
            if (!ready() || !(format.equals("banner") || format.equals("native"))) { call.resolve(); return; }
            int token = generation;
            initialize(() -> {
                if (!ready() || token != generation) { call.resolve(); return; }
                ensureDock();
                if (format.equals("banner")) {
                    int width = Math.max(1, call.getInt("width", 320));
                    banner = new AdView(getContext()); banner.setAdUnitId(BANNER);
                    banner.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(getContext(), width));
                    dock.addView(banner);
                    banner.setAdListener(new AdListener() {
                        @Override public void onAdLoaded() { if (token == generation && ready()) { loaded = true; dock.setVisibility(slotVisible ? View.VISIBLE : View.GONE); } }
                        @Override public void onAdFailedToLoad(LoadAdError error) { if (token == generation) { clear(); notifyListeners("unavailable", new JSObject()); } }
                    });
                    banner.loadAd(new AdRequest.Builder().build());
                } else {
                    new AdLoader.Builder(getContext(), NATIVE).forNativeAd(ad -> {
                        if (token != generation || !ready()) { ad.destroy(); return; }
                        nativeAd = ad;
                        NativeAdView view = new NativeAdView(getContext());
                        LinearLayout assets = new LinearLayout(getContext()); assets.setOrientation(LinearLayout.VERTICAL);
                        assets.setPadding(dp(12), dp(8), dp(12), dp(8));
                        TextView label = new TextView(getContext()); label.setText("Advertisement · Test ad"); assets.addView(label);
                        TextView headline = new TextView(getContext()); headline.setText(ad.getHeadline());
                        headline.setTextColor(0xff111827); headline.setTextSize(16); assets.addView(headline); view.setHeadlineView(headline);
                        TextView body = new TextView(getContext()); body.setText(ad.getBody()); body.setMaxLines(2);
                        assets.addView(body); view.setBodyView(body);
                        MediaView media = new MediaView(getContext());
                        assets.addView(media, new LinearLayout.LayoutParams(-1, dp(120)));
                        view.setMediaView(media);
                        Button action = new Button(getContext()); action.setText(ad.getCallToAction());
                        action.setVisibility(ad.getCallToAction() == null ? View.GONE : View.VISIBLE);
                        assets.addView(action); view.setCallToActionView(action);
                        view.addView(assets, new FrameLayout.LayoutParams(-1, -2));
                        // Google automatically places AdChoices in the NativeAdView.
                        view.setNativeAd(ad); dock.addView(view); loaded = true; dock.setVisibility(slotVisible ? View.VISIBLE : View.GONE);
                    }).withAdListener(new AdListener() {
                        @Override public void onAdFailedToLoad(LoadAdError error) { if (token == generation) { clear(); notifyListeners("unavailable", new JSObject()); } }
                    }).build().loadAd(new AdRequest.Builder().build());
                }
                JSObject result = new JSObject();
                result.put("height", format.equals("banner") ? banner.getAdSize().getHeight() : 320);
                call.resolve(result);
            });
        });
    }
    @PluginMethod public void reward(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (rewardBusy || !optedIn() || !consentUpdated || !consent.canRequestAds()) { call.reject("Ads unavailable"); return; }
            rewardBusy = true; enabled = true;
            int token = generation;
            initialize(() -> {
                if (token != generation || !ready()) { rewardBusy = false; call.reject("Placement closed"); return; }
                RewardedAd.load(getContext(), REWARDED, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
                    @Override public void onAdFailedToLoad(LoadAdError error) { rewardBusy = false; call.reject("Ad unavailable. Please try later."); }
                    @Override public void onAdLoaded(RewardedAd ad) {
                        if (token != generation || !ready() || !getActivity().hasWindowFocus()) { rewardBusy = false; call.reject("Placement closed"); return; }
                        final boolean[] earned = { false };
                        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                            @Override public void onAdDismissedFullScreenContent() {
                                rewardBusy = false; JSObject result = new JSObject(); result.put("earned", earned[0]); call.resolve(result);
                            }
                            @Override public void onAdFailedToShowFullScreenContent(AdError error) { rewardBusy = false; call.reject("Ad unavailable"); }
                        });
                        ad.show(getActivity(), reward -> earned[0] = true);
                    }
                });
            });
        });
    }
    @Override protected void handleOnPause() { clear(); }
    @Override protected void handleOnDestroy() { clear(); }
}

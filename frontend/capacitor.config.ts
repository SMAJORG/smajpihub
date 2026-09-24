import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.smajpihub.mobile",
  appName: "SMAJ PI HUB",
  webDir: "dist-capacitor",
  server: { androidScheme: "https", hostname: "smajpihub.com" },
  android: { allowMixedContent: false, backgroundColor: "#0f1b2d" },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
      backgroundColor: "#0f1b2d",
    },
  },
};

export default config;

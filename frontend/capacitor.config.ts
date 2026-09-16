import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.smajpihub.mobile",
  appName: "SMAJ PI HUB",
  webDir: "dist-capacitor",
  server: { androidScheme: "https", hostname: "smajpihub.com" },
  android: { allowMixedContent: false, backgroundColor: "#ffffff" },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#ffffff",
    },
  },
};

export default config;

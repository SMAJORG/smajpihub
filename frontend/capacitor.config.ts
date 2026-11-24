import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.smajpihub.mobile",
  appName: "SMAJ PI HUB",
  webDir: "dist-capacitor",
  server: { androidScheme: "https", hostname: "smajpihub.com" },
  android: { allowMixedContent: false, backgroundColor: "#FFFFFF" },
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_smaj", iconColor: "#08768b" },
    StatusBar: {
      overlaysWebView: false,
      style: "LIGHT",
      backgroundColor: "#FFFFFF",
    },
  },
};

export default config;

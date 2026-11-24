import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.smajpihub.mobile",
  appName: "SMAJ PI HUB",
  webDir: "dist-capacitor",
  server: { androidScheme: "https", hostname: "smajpihub.com" },
  android: { allowMixedContent: false, backgroundColor: "transparent" },
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_smaj", iconColor: "#08768b" },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "transparent",
    },
  },
};

export default config;

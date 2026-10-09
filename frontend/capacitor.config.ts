import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.smajpihub.mobile",
  appName: "SMAJ PI HUB",
  webDir: "dist-capacitor",
  server: { androidScheme: "https", hostname: "smajpihub.com" },
  android: { allowMixedContent: false, backgroundColor: "#f2f2f2" },
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_smaj", iconColor: "#08768b" },
    StatusBar: {
      overlaysWebView: false,
      style: "DARK",
      backgroundColor: "#f2f2f2",
    },
  },
};

export default config;

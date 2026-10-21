import { defineConfig, mergeConfig } from "vite";
import applicationConfig from "../vite.config";

export default defineConfig(environment =>
  mergeConfig(typeof applicationConfig === "function" ? applicationConfig(environment) : applicationConfig, {
    cacheDir: "node_modules/.vite-careroute",
    optimizeDeps: {
      entries: ["tests/careroute.html"],
      exclude: ["@smaj/localization/jsx-runtime", "@smaj/localization/jsx-dev-runtime"],
      include: [
        "react",
        "react-dom/client",
        "react-router-dom",
        "react/jsx-runtime",
        "axios",
        "react-i18next",
        "i18next",
        "i18next-browser-languagedetector",
      ],
      esbuildOptions: { sourcemap: false },
    },
  })
);

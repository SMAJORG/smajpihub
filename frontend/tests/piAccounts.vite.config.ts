import { defineConfig, mergeConfig } from 'vite';
import applicationConfig from '../vite.config';
export default defineConfig(environment => mergeConfig(
  typeof applicationConfig === 'function' ? applicationConfig(environment) : applicationConfig,
  { cacheDir: 'node_modules/.vite-piAccounts', optimizeDeps: {
    entries: ['tests/piAccounts.html'],
    exclude: ['@smaj/localization/jsx-runtime', '@smaj/localization/jsx-dev-runtime'],
  } },
));

import dotenv from "dotenv";

const result = dotenv.config();

if (result.error) {
  if (
    process.env.NODE_ENV === "development" &&
    !process.env.RUNNING_IN_CONTAINER
  ) {
    console.error(
      ".env file not found. This is an error condition in development. Additional error is logged below",
    );
    throw result.error;
  }

  // In production, environment variables are injected into the container environment. We should not even have
  // a .env file inside the running container.
}

interface Environment {
  node_env: string;
  is_production: boolean;
  is_render: boolean;
  port: number;
  session_secret: string;
  pi_api_key: string;
  platform_api_url: string;
  mongodb_uri: string;
  mongo_host: string;
  mongo_db_name: string;
  mongo_user: string;
  mongo_password: string;
  frontend_url: string;
  use_memory_db: boolean;
  dev_auth: boolean;
  admin_pi_usernames: string[];
  cloudinary_cloud_name: string;
  cloudinary_upload_preset: string;
  cloudinary_folder: string;
  marketplace_auto_approve_products: boolean;
  session_debug: boolean;
  tmdb_access_token: string;
  cloudflare_stream_account_id: string;
  cloudflare_stream_api_token: string;
  youtube_api_key: string;
  youtube_live_channel_ids: string[];
  youtube_live_refresh_minutes: number;
  sports_provider: string;
  sports_api_key: string;
  sports_league_ids: string[];
  sports_cache_seconds: number;
  news_api_key: string;
  translation_api_url: string;
  translation_api_url_ar: string;
  translation_api_url_sw: string;
  translation_api_url_zh: string;
  translation_api_key: string;
  google_maps_api_key: string;
}

const nodeEnv = process.env.NODE_ENV || "development";
const isRender = Boolean(
  process.env.RENDER ||
  process.env.RENDER_SERVICE_ID ||
  process.env.RENDER_EXTERNAL_URL,
);
const isProduction = nodeEnv === "production" || isRender;
const defaultSessionSecret = "This is my session secret";
const productionPiPlatformAPIURL = "https://api.minepi.com";
const normalizePiUsername = (username: string) =>
  username.trim().replace(/^@+/, "").toLowerCase();

const platformApiURL =
  process.env.PLATFORM_API_URL || productionPiPlatformAPIURL;

const env: Environment = {
  node_env: nodeEnv,
  is_production: isProduction,
  is_render: isRender,
  port: parseInt(process.env.PORT || "8000"),
  session_secret: process.env.SESSION_SECRET || defaultSessionSecret,
  pi_api_key: process.env.PI_API_KEY || "",
  platform_api_url: platformApiURL,
  mongodb_uri: process.env.MONGODB_URI || "",
  mongo_host: process.env.MONGO_HOST || "localhost:27017",
  mongo_db_name: process.env.MONGODB_DATABASE_NAME || "smajpihub",
  mongo_user: process.env.MONGODB_USERNAME || "",
  mongo_password: process.env.MONGODB_PASSWORD || "",
  frontend_url: process.env.FRONTEND_URL || "http://localhost:3314",
  use_memory_db:
    String(process.env.USE_MEMORY_DB || "false").toLowerCase() === "true",
  dev_auth: String(process.env.DEV_AUTH || "false").toLowerCase() === "true",
  admin_pi_usernames: String(process.env.ADMIN_PI_USERNAMES || "")
    .split(",")
    .map(normalizePiUsername)
    .filter(Boolean),
  cloudinary_cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinary_upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET || "",
  cloudinary_folder: process.env.CLOUDINARY_FOLDER || "smajpihub",
  marketplace_auto_approve_products:
    String(
      process.env.MARKETPLACE_AUTO_APPROVE_PRODUCTS || "false",
    ).toLowerCase() === "true",
  session_debug:
    String(process.env.SESSION_DEBUG || "false").toLowerCase() === "true",
  tmdb_access_token: process.env.TMDB_ACCESS_TOKEN || "",
  cloudflare_stream_account_id: process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_STREAM_ACCOUNT_ID || "",
  cloudflare_stream_api_token: process.env.CLOUDFLARE_STREAM_API_TOKEN || "",
  youtube_api_key: String(process.env.YOUTUBE_API_KEY || "").trim(),
  youtube_live_channel_ids: String(process.env.YOUTUBE_LIVE_CHANNEL_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^UC[A-Za-z0-9_-]{20,}$/.test(value)),
  youtube_live_refresh_minutes: Math.max(
    5,
    Number(process.env.YOUTUBE_LIVE_REFRESH_MINUTES) || 360,
  ),
  sports_provider: String(process.env.SPORTS_PROVIDER || "")
    .trim()
    .toLowerCase(),
  sports_api_key: String(process.env.SPORTS_API_KEY || "").trim(),
  sports_league_ids: String(process.env.SPORTS_LEAGUE_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  sports_cache_seconds: Math.max(
    60,
    Number(process.env.SPORTS_CACHE_SECONDS) || 900,
  ),
  news_api_key: String(process.env.NEWS_API_KEY || "").trim(),
  translation_api_url: String(process.env.TRANSLATION_API_URL || "http://localhost:5000").trim(),
  translation_api_url_ar: String(process.env.TRANSLATION_API_URL_AR || process.env.TRANSLATION_API_URL || "http://localhost:5000").trim(),
  translation_api_url_sw: String(process.env.TRANSLATION_API_URL_SW || process.env.TRANSLATION_API_URL || "http://localhost:5000").trim(),
  translation_api_url_zh: String(process.env.TRANSLATION_API_URL_ZH || process.env.TRANSLATION_API_URL || "http://localhost:5000").trim(),
  translation_api_key: String(process.env.TRANSLATION_API_KEY || "").trim(),
  google_maps_api_key: String(process.env.GOOGLE_MAPS_API_KEY || "").trim(),
};

if (
  process.env.PLATFORM_API_URL &&
  process.env.PLATFORM_API_URL !== productionPiPlatformAPIURL
) {
  console.warn(
    `Using PLATFORM_API_URL=${process.env.PLATFORM_API_URL} for Pi backend requests instead of the default ${productionPiPlatformAPIURL}.`,
  );
}

if (isProduction) {
  const missing: string[] = [];
  if (
    !process.env.SESSION_SECRET ||
    env.session_secret === defaultSessionSecret
  )
    missing.push("SESSION_SECRET");
  if (!env.pi_api_key) missing.push("PI_API_KEY");
  if (!process.env.FRONTEND_URL) missing.push("FRONTEND_URL");
  if (env.use_memory_db) missing.push("USE_MEMORY_DB=false");
  if (!env.mongodb_uri && !process.env.MONGO_HOST)
    missing.push("MONGODB_URI or MONGO_HOST");
  if (!env.mongodb_uri && !process.env.MONGODB_DATABASE_NAME)
    missing.push("MONGODB_DATABASE_NAME");
  if (!env.cloudinary_cloud_name) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!env.cloudinary_upload_preset) missing.push("CLOUDINARY_UPLOAD_PRESET");

  if (missing.length) {
    throw new Error(
      `Missing or invalid production environment configuration: ${missing.join(", ")}`,
    );
  }
}

export default env;

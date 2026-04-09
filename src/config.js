import { config as loadEnv } from "dotenv";

loadEnv();

const appStage = String(process.env.APP_STAGE || "prod").toLowerCase() === "test" ? "test" : "prod";
const botToken =
  process.env.BOT_TOKEN ||
  (appStage === "test" ? process.env.BOT_TOKEN_TEST : process.env.BOT_TOKEN_PROD) ||
  "";
const botUsername =
  process.env.BOT_USERNAME ||
  (appStage === "test" ? process.env.BOT_USERNAME_TEST : process.env.BOT_USERNAME_PROD) ||
  "";

export const config = {
  botToken,
  botUsername: String(botUsername).replace(/^@/, ""),
  appStage,
  mongoUri: process.env.MONGODB_URI || "",
  mongoDbName: process.env.MONGODB_DB || "",
  mongoCollectionProd: process.env.MONGODB_COLLECTION_PROD || "app_state_prod",
  mongoCollectionTest: process.env.MONGODB_COLLECTION_TEST || "app_state_test",
  migrationFile: process.env.MIGRATION_FILE || "",
  openRouteServiceApiKey: process.env.OPENROUTESERVICE_API_KEY || "",
  graphHopperApiKey: process.env.GRAPHHOPPER_API_KEY || "",
  miniAppBaseUrl: String(process.env.MINI_APP_BASE_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/$/, ""),
  miniAppHost: process.env.MINI_APP_HOST || "0.0.0.0",
  miniAppPort: Math.max(1, Number(process.env.MINI_APP_PORT || 3210)),
  miniAppSecret: process.env.MINI_APP_SECRET || botToken || "hiking-telegram-bot-mini-app",
  vpohidArchiveSyncEnabled: String(process.env.VPOHID_ARCHIVE_SYNC_ENABLED || "true").toLowerCase() !== "false",
  vpohidArchiveSyncHours: Math.max(1, Number(process.env.VPOHID_ARCHIVE_SYNC_HOURS || 24)),
  vpohidArchiveSyncStartupDelayMinutes: Math.max(0, Number(process.env.VPOHID_ARCHIVE_SYNC_STARTUP_DELAY_MINUTES || 3))
};

config.mongoCollectionName =
  config.appStage === "test" ? config.mongoCollectionTest : config.mongoCollectionProd;

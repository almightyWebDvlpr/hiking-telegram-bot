import { config as loadEnv } from "dotenv";

loadEnv();

export const config = {
  botToken: process.env.BOT_TOKEN || "",
  botUsername: String(process.env.BOT_USERNAME || "").replace(/^@/, ""),
  appStage: String(process.env.APP_STAGE || "prod").toLowerCase() === "test" ? "test" : "prod",
  mongoUri: process.env.MONGODB_URI || "",
  mongoDbName: process.env.MONGODB_DB || "",
  mongoCollectionProd: process.env.MONGODB_COLLECTION_PROD || "app_state_prod",
  mongoCollectionTest: process.env.MONGODB_COLLECTION_TEST || "app_state_test",
  migrationFile: process.env.MIGRATION_FILE || "",
  openRouteServiceApiKey: process.env.OPENROUTESERVICE_API_KEY || "",
  graphHopperApiKey: process.env.GRAPHHOPPER_API_KEY || "",
  vpohidArchiveSyncEnabled: String(process.env.VPOHID_ARCHIVE_SYNC_ENABLED || "true").toLowerCase() !== "false",
  vpohidArchiveSyncHours: Math.max(1, Number(process.env.VPOHID_ARCHIVE_SYNC_HOURS || 24)),
  vpohidArchiveSyncStartupDelayMinutes: Math.max(0, Number(process.env.VPOHID_ARCHIVE_SYNC_STARTUP_DELAY_MINUTES || 3))
};

config.mongoCollectionName =
  config.appStage === "test" ? config.mongoCollectionTest : config.mongoCollectionProd;

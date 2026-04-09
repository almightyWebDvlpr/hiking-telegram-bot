import { config } from "./config.js";
import { createBot } from "./bot.js";
import { MongoStore } from "./store/mongoStore.js";

if (!config.botToken) {
  console.error("BOT_TOKEN is missing. Add it to the .env file.");
  process.exit(1);
}

if (!config.mongoUri) {
  console.error("MONGODB_URI is missing. Add it to the .env file.");
  process.exit(1);
}

async function createStore() {
  const store = new MongoStore({
    uri: config.mongoUri,
    dbName: config.mongoDbName,
    collectionName: config.mongoCollectionName,
    filePath: config.migrationFile
  });
  await store.init();
  return store;
}

const store = await createStore();
const bot = createBot(store);

bot.launch().then(() => {
  console.log(`Hiking Telegram bot is running with MongoDB. Stage=${config.appStage}, collection=${config.mongoCollectionName}`);
});

process.once("SIGINT", async () => {
  if (bot.vpohidArchiveSyncLoop?.stop) {
    bot.vpohidArchiveSyncLoop.stop();
  }
  bot.stop("SIGINT");
  if (typeof store.close === "function") {
    await store.close();
  }
});
process.once("SIGTERM", async () => {
  if (bot.vpohidArchiveSyncLoop?.stop) {
    bot.vpohidArchiveSyncLoop.stop();
  }
  bot.stop("SIGTERM");
  if (typeof store.close === "function") {
    await store.close();
  }
});

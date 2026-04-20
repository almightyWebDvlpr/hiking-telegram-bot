import fs from "node:fs";
import { MongoClient } from "mongodb";

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeData(data) {
  return {
    groups: Array.isArray(data?.groups) ? data.groups : [],
    users: Array.isArray(data?.users) ? data.users : []
  };
}

export class MongoStore {
  constructor({ uri, dbName = "", collectionName = "app_state", filePath = "" }) {
    this.uri = uri;
    this.dbName = dbName;
    this.collectionName = collectionName;
    this.filePath = filePath;
    this.client = new MongoClient(this.uri);
    this.collection = null;
    this.cache = normalizeData({});
    this.writeChain = Promise.resolve();
    this.lastWriteError = null;
  }

  async init() {
    await this.client.connect();
    const db = this.dbName ? this.client.db(this.dbName) : this.client.db();
    this.collection = db.collection(this.collectionName);

    const existing = await this.collection.findOne({ _id: "main" });
    if (existing) {
      this.cache = normalizeData(existing);
      return;
    }

    let seed = normalizeData({});
    if (this.filePath && fs.existsSync(this.filePath)) {
      try {
        seed = normalizeData(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
      } catch (error) {
        console.error(`Failed to migrate JSON store from ${this.filePath}:`, error.message);
      }
    }

    this.cache = seed;
    await this.collection.replaceOne(
      { _id: "main" },
      { _id: "main", ...seed, updatedAt: new Date().toISOString() },
      { upsert: true }
    );
  }

  read() {
    return cloneData(this.cache);
  }

  write(data) {
    this.cache = normalizeData(data);
    const payload = { _id: "main", ...this.cache, updatedAt: new Date().toISOString() };

    this.writeChain = this.writeChain
      .catch(() => null)
      .then(async () => {
        try {
          await this.collection.replaceOne({ _id: "main" }, payload, { upsert: true });
          this.lastWriteError = null;
        } catch (error) {
          this.lastWriteError = error;
          console.error("Failed to persist data to MongoDB:", error.message);
          throw error;
        }
      });
  }

  async flush() {
    await this.writeChain;
    if (this.lastWriteError) {
      throw this.lastWriteError;
    }
  }

  async close() {
    await this.flush();
    await this.client.close();
  }
}

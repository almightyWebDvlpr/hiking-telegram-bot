import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIVE_MAP_DIR = path.join(__dirname, "live-map");

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function sendFile(response, filePath, contentType) {
  const content = await fs.readFile(filePath);
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(content);
}

export function createLiveMapServer({ config, liveMapService }) {
  if (!config.miniAppBaseUrl) {
    return {
      start() {
        return null;
      },
      async stop() {
        return null;
      }
    };
  }

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

      if (request.method === "GET" && url.pathname === "/mini-app/live-map") {
        return sendFile(response, path.join(LIVE_MAP_DIR, "index.html"), "text/html; charset=utf-8");
      }

      if (request.method === "GET" && url.pathname === "/mini-app/live-map/app.js") {
        return sendFile(response, path.join(LIVE_MAP_DIR, "app.js"), "application/javascript; charset=utf-8");
      }

      if (request.method === "GET" && url.pathname === "/mini-app/live-map/styles.css") {
        return sendFile(response, path.join(LIVE_MAP_DIR, "styles.css"), "text/css; charset=utf-8");
      }

      if (request.method === "GET" && url.pathname === "/mini-app/api/live-map/bootstrap") {
        const token = url.searchParams.get("token") || "";
        const payload = await liveMapService.getBootstrapData(token);
        return json(response, 200, payload);
      }

      if (request.method === "POST" && url.pathname === "/mini-app/api/live-map/location") {
        const token = url.searchParams.get("token") || "";
        const rawBody = await readBody(request);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const payload = liveMapService.updateLocation(token, body);
        return json(response, 200, payload);
      }

      return json(response, 404, { error: "Not found" });
    } catch (error) {
      return json(response, 400, { error: error?.message || "Request failed" });
    }
  });

  return {
    start() {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.miniAppPort, config.miniAppHost, () => {
          server.off("error", reject);
          console.log(`Mini App server is running at ${config.miniAppHost}:${config.miniAppPort}`);
          resolve(server);
        });
      });
    },
    stop() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  };
}

import fs from "node:fs";
import path from "node:path";

export class FileStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.ensureStore();
  }

  ensureStore() {
    const dir = path.dirname(this.filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ groups: [] }, null, 2));
    }
  }

  read() {
    const raw = fs.readFileSync(this.filePath, "utf8");
    return JSON.parse(raw);
  }

  write(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}

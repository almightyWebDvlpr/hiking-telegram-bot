import { VpohidLiveService } from "../services/vpohidLiveService.js";

async function main() {
  const service = new VpohidLiveService();
  const summary = await service.syncArchive();

  console.log("vpohid archive sync completed");
  console.log(`ok: ${summary.ok}`);
  console.log(`failed: ${summary.failed}`);
  console.log(`skipped: ${summary.skipped}`);

  if (summary.errors.length) {
    console.log("errors:");
    for (const item of summary.errors) {
      console.log(`- route/${item.routeId}: ${item.error}`);
    }
  }
}

main().catch((error) => {
  console.error("vpohid archive sync failed");
  console.error(error);
  process.exitCode = 1;
});

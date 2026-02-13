/**
 * Local test script for the alerting system
 * Run with: npm run alerting:test
 *
 * This simulates a scheduled event and runs the alerting logic locally
 * using your .dev.vars.alerting file for secrets.
 */

import { unstable_dev } from "wrangler";

async function main() {
  console.log("🚀 Starting local alerting test...\n");

  const worker = await unstable_dev("src/alerting/scheduler.ts", {
    config: "wrangler.alerting.jsonc",
    experimental: { disableExperimentalWarning: true }
  });

  try {
    console.log("📊 Triggering scheduled event...\n");

    // Manually trigger the scheduled event
    const response = await worker.fetch("/__scheduled", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cron: "*/10 * * * *",
        scheduledTime: Date.now(),
        forceAlert: true,
        ignoreCooldown: true,
        mockErrorRate: 42,
        mockLlmErrorRate: 55
      })
    });

    console.log("\n✅ Test completed");
    console.log(`Response status: ${response.status}`);

    if (!response.ok) {
      const text = await response.text();
      console.error("❌ Error response:", text);
    }
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  } finally {
    await worker.stop();
  }
}

main();

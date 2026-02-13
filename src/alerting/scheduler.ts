import type { AlertingEnv, Anomaly } from "./types";
import { CloudflareAnalyticsClient } from "./clients/cloudflare";
import { LangSmithClient } from "./clients/langsmith";
import { NtfyNotifier } from "./notifier";
import { AlertStateManager } from "./state";
import {
  checkCloudflareAnomalies,
  checkLangSmithAnomalies
} from "./thresholds";

const runAlerting = async (when: Date, env: AlertingEnv): Promise<void> => {
  console.log(`[Alerting] Scheduled run at ${when.toISOString()}`);

  try {
    // Initialize clients
    const cloudflareClient = new CloudflareAnalyticsClient(env);
    const langsmithClient = new LangSmithClient(env);
    const notifier = new NtfyNotifier(env);
    const stateManager = new AlertStateManager(env);

    // Get timing configuration from environment
    const checkIntervalMinutes = parseInt(
      env.CHECK_INTERVAL_MINUTES || "10",
      10
    );
    const baselinePeriodHours = parseInt(env.BASELINE_PERIOD_HOURS || "1", 10);

    // Fetch current metrics
    const [cfMetrics, lsMetrics] = await Promise.all([
      cloudflareClient.getMetrics(checkIntervalMinutes).catch((err) => {
        console.error("[Alerting] Failed to fetch Cloudflare metrics:", err);
        return null;
      }),
      langsmithClient.getMetrics(checkIntervalMinutes).catch((err) => {
        console.error("[Alerting] Failed to fetch LangSmith metrics:", err);
        return null;
      })
    ]);

    // Fetch baseline metrics for comparison
    const [cfBaseline, lsBaseline] = await Promise.all([
      cloudflareClient
        .getBaselineMetrics(baselinePeriodHours)
        .catch(() => null),
      langsmithClient.getBaselineMetrics(baselinePeriodHours).catch(() => null)
    ]);

    // Check for anomalies
    const anomalies = [];

    if (cfMetrics) {
      const cfAnomalies = checkCloudflareAnomalies(cfMetrics, cfBaseline);
      anomalies.push(...cfAnomalies);
      console.log(
        `[Alerting] Cloudflare: ${cfAnomalies.length} anomalies detected`
      );
    }

    if (lsMetrics) {
      const lsAnomalies = checkLangSmithAnomalies(lsMetrics, lsBaseline);
      anomalies.push(...lsAnomalies);
      console.log(
        `[Alerting] LangSmith: ${lsAnomalies.length} anomalies detected`
      );
    }

    if (anomalies.length === 0) {
      console.log("[Alerting] No anomalies detected");
      return;
    }

    // Filter out alerts that are in cooldown
    const newAlerts = await stateManager.filterNewAlerts(anomalies);

    if (newAlerts.length === 0) {
      console.log(
        `[Alerting] ${anomalies.length} anomalies detected but all are in cooldown`
      );
      return;
    }

    console.log(
      `[Alerting] ${newAlerts.length} new alerts to send (${anomalies.length - newAlerts.length} in cooldown)`
    );

    // Send notification
    await notifier.sendAlert(newAlerts);
    console.log(`[Alerting] Sent notification for ${newAlerts.length} alerts`);

    // Record that we sent these alerts
    await stateManager.recordAlerts(newAlerts);
    console.log("[Alerting] Recorded alert state");
  } catch (error) {
    console.error("[Alerting] Error in scheduled handler:", error);
    // Don't throw - we don't want to fail the entire scheduled run
  }
};

const sendForcedAlert = async (
  when: Date,
  env: AlertingEnv,
  options: {
    ignoreCooldown: boolean;
    mockErrorRate: number;
    mockLlmErrorRate: number;
  }
): Promise<void> => {
  const notifier = new NtfyNotifier(env);
  const stateManager = new AlertStateManager(env);

  const anomalies: Anomaly[] = [
    {
      type: "high_error_rate",
      severity: "high",
      message: `Error rate is ${options.mockErrorRate.toFixed(2)}% (threshold: 5%)`,
      value: options.mockErrorRate,
      threshold: 5,
      timestamp: when
    },
    {
      type: "llm_error_rate",
      severity: "high",
      message: `LLM error rate is ${options.mockLlmErrorRate.toFixed(2)}% (threshold: 10%)`,
      value: options.mockLlmErrorRate,
      threshold: 10,
      timestamp: when
    }
  ];

  const alertsToSend = options.ignoreCooldown
    ? anomalies
    : await stateManager.filterNewAlerts(anomalies);

  if (alertsToSend.length === 0) {
    console.log("[Alerting] Forced alert skipped due to cooldown");
    return;
  }

  await notifier.sendAlert(alertsToSend);
  console.log(`[Alerting] Sent forced alert for ${alertsToSend.length} alerts`);

  await stateManager.recordAlerts(alertsToSend);
  console.log("[Alerting] Recorded alert state");
};

export default {
  async fetch(
    request: Request,
    env: AlertingEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/__scheduled") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let scheduledTime = Date.now();
    let forceAlert = false;
    let ignoreCooldown = false;
    let mockErrorRate = 25;
    let mockLlmErrorRate = 35;
    try {
      const body = (await request.json()) as {
        scheduledTime?: unknown;
        forceAlert?: unknown;
        ignoreCooldown?: unknown;
        mockErrorRate?: unknown;
        mockLlmErrorRate?: unknown;
      };
      if (typeof body.scheduledTime === "number") {
        scheduledTime = body.scheduledTime;
      }
      if (typeof body.forceAlert === "boolean") {
        forceAlert = body.forceAlert;
      }
      if (typeof body.ignoreCooldown === "boolean") {
        ignoreCooldown = body.ignoreCooldown;
      }
      if (typeof body.mockErrorRate === "number") {
        mockErrorRate = body.mockErrorRate;
      }
      if (typeof body.mockLlmErrorRate === "number") {
        mockLlmErrorRate = body.mockLlmErrorRate;
      }
    } catch {
      // Ignore body parse errors and use current time.
    }

    if (forceAlert) {
      try {
        await sendForcedAlert(new Date(scheduledTime), env, {
          ignoreCooldown,
          mockErrorRate,
          mockLlmErrorRate
        });
        return new Response("Forced alert", { status: 200 });
      } catch (error) {
        console.error("[Alerting] Forced alert failed:", error);
        return new Response("Forced alert failed", { status: 500 });
      }
    }

    ctx.waitUntil(runAlerting(new Date(scheduledTime), env));
    return new Response("Scheduled", { status: 202 });
  },
  async scheduled(
    event: ScheduledEvent,
    env: AlertingEnv,
    _ctx: ExecutionContext
  ): Promise<void> {
    await runAlerting(new Date(event.scheduledTime), env);
  }
};

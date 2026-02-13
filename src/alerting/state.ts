import type { Anomaly, AlertState, AlertingEnv } from "./types";

export class AlertStateManager {
  private readonly kv: KVNamespace;
  private readonly cooldownMinutes: number;
  private readonly kvTtlSeconds: number;

  constructor(env: AlertingEnv) {
    this.kv = env.ALERT_STATE;
    this.cooldownMinutes = parseInt(env.ALERT_COOLDOWN_MINUTES || "60", 10);
    const kvTtlDays = parseInt(env.KV_TTL_DAYS || "7", 10);
    this.kvTtlSeconds = kvTtlDays * 24 * 60 * 60; // Convert days to seconds
  }

  /**
   * Filters out anomalies that are still in cooldown period
   */
  async filterNewAlerts(anomalies: Anomaly[]): Promise<Anomaly[]> {
    const newAlerts: Anomaly[] = [];

    for (const anomaly of anomalies) {
      const key = this.getStateKey(anomaly.type);
      const stateJson = await this.kv.get(key);

      if (stateJson) {
        const state: AlertState = JSON.parse(stateJson);
        const cooldownMs = this.cooldownMinutes * 60 * 1000;
        const timeSinceLastAlert = Date.now() - state.lastAlertTime;

        if (timeSinceLastAlert < cooldownMs) {
          // Still in cooldown, skip this alert
          continue;
        }
      }

      // Either no previous alert or cooldown has passed
      newAlerts.push(anomaly);
    }

    return newAlerts;
  }

  /**
   * Records that alerts have been sent for the given anomalies
   */
  async recordAlerts(anomalies: Anomaly[]): Promise<void> {
    const now = Date.now();

    for (const anomaly of anomalies) {
      const key = this.getStateKey(anomaly.type);
      const stateJson = await this.kv.get(key);

      let state: AlertState;
      if (stateJson) {
        state = JSON.parse(stateJson);
        state.lastAlertTime = now;
        state.alertCount += 1;
      } else {
        state = {
          lastAlertTime: now,
          alertCount: 1
        };
      }

      // Store with configured TTL (should be longer than any cooldown)
      await this.kv.put(key, JSON.stringify(state), {
        expirationTtl: this.kvTtlSeconds
      });
    }
  }

  /**
   * Gets the current state for a specific alert type
   */
  async getState(alertType: Anomaly["type"]): Promise<AlertState | null> {
    const key = this.getStateKey(alertType);
    const stateJson = await this.kv.get(key);

    if (!stateJson) {
      return null;
    }

    return JSON.parse(stateJson);
  }

  /**
   * Clears all alert state (useful for testing)
   */
  async clearAllState(): Promise<void> {
    const alertTypes: Anomaly["type"][] = [
      "high_error_rate",
      "high_latency",
      "traffic_spike",
      "llm_error_rate",
      "llm_latency",
      "llm_high_tokens"
    ];

    for (const type of alertTypes) {
      const key = this.getStateKey(type);
      await this.kv.delete(key);
    }
  }

  private getStateKey(alertType: Anomaly["type"]): string {
    return `alert_state:${alertType}`;
  }
}

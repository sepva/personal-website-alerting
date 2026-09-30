import type { Anomaly, AlertingEnv } from "./types";

export class NtfyNotifier {
  private readonly baseUrl: string;
  private readonly topic: string;
  private readonly token?: string;

  constructor(env: AlertingEnv) {
    this.baseUrl = env.NTFY_BASE_URL || "https://ntfy.sh";
    this.topic = env.NTFY_TOPIC;
    this.token = env.NTFY_TOKEN;
  }

  async sendAlert(anomalies: Anomaly[]): Promise<void> {
    if (anomalies.length === 0) return;

    const message = this.formatMessage(anomalies);
    const title = this.formatTitle(anomalies);
    const priority = this.determinePriority(anomalies);
    const tags = this.determineTags(anomalies);

    const headers: Record<string, string> = {
      Title: title,
      Priority: priority,
      Tags: tags
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseUrl}/${this.topic}`, {
      method: "POST",
      body: message,
      headers
    });

    if (!response.ok) {
      throw new Error(
        `Failed to send ntfy notification: ${response.status} ${response.statusText}`
      );
    }
  }

  private formatTitle(anomalies: Anomaly[]): string {
    if (anomalies.length === 1) {
      const anomaly = anomalies[0];
      return this.getTypeTitle(anomaly.type);
    }
    return `${anomalies.length} Alerts Detected`;
  }

  private formatMessage(anomalies: Anomaly[]): string {
    if (anomalies.length === 1) {
      return anomalies[0].message;
    }

    const lines = anomalies.map(
      (a) => `• ${this.getTypeTitle(a.type)}: ${a.message}`
    );
    return `Multiple anomalies detected:\n\n${lines.join("\n")}`;
  }

  private determinePriority(anomalies: Anomaly[]): string {
    // If any anomaly is high severity, use high priority
    const hasHighSeverity = anomalies.some((a) => a.severity === "high");
    return hasHighSeverity ? "high" : "default";
  }

  private determineTags(anomalies: Anomaly[]): string {
    const tags = new Set<string>();

    for (const anomaly of anomalies) {
      if (anomaly.severity === "high") {
        tags.add("warning");
      }
      if (
        anomaly.type.includes("error") ||
        anomaly.type === "high_error_rate" ||
        anomaly.type === "llm_error_rate"
      ) {
        tags.add("rotating_light");
      }
      if (anomaly.type.includes("latency")) {
        tags.add("hourglass");
      }
      if (anomaly.type === "traffic_spike") {
        tags.add("chart_with_upwards_trend");
      }
    }

    return Array.from(tags).join(",") || "bell";
  }

  private getTypeTitle(type: Anomaly["type"]): string {
    const titles: Record<Anomaly["type"], string> = {
      high_error_rate: "High Error Rate",
      high_latency: "High Latency",
      traffic_spike: "Traffic Spike",
      llm_error_rate: "LLM Error Rate",
      llm_latency: "LLM Latency",
      llm_high_tokens: "High Token Usage"
    };
    return titles[type];
  }
}

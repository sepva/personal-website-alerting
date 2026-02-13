export interface CloudflareMetrics {
  requestCount: number;
  errorRate: number; // Percentage
  p95Latency: number; // Milliseconds
  p99Latency: number; // Milliseconds
  errors5xx: number;
  errors4xx: number;
  timestamp: Date;
}

export interface LangSmithMetrics {
  totalRuns: number;
  errorCount: number;
  errorRate: number; // Percentage
  avgLatency: number; // Milliseconds
  p95Latency: number; // Milliseconds
  totalTokens: number;
  avgTokensPerRun: number;
  timestamp: Date;
}

export interface Anomaly {
  type:
    | "high_error_rate"
    | "high_latency"
    | "traffic_spike"
    | "llm_error_rate"
    | "llm_latency"
    | "llm_high_tokens";
  severity: "high" | "default";
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

export interface AlertState {
  lastAlertTime: number; // Unix timestamp
  alertCount: number;
}

export interface Thresholds {
  errorRatePercent: number; // e.g., 5
  p95LatencyMs: number; // e.g., 2000
  p99LatencyMs: number; // e.g., 3000
  trafficSpikeMultiplier: number; // e.g., 2.0 (200%)
  llmErrorRatePercent: number; // e.g., 10
  llmP95LatencyMs: number; // e.g., 10000 (10s)
  llmTokenSpikeMultiplier: number; // e.g., 3.0 (300%)
}

export interface AlertingEnv {
  // KV namespace for alert state
  ALERT_STATE: KVNamespace;

  // Notification settings
  NTFY_TOPIC: string;
  NTFY_BASE_URL?: string; // defaults to https://ntfy.sh
  NTFY_TOKEN?: string; // optional auth token

  // Alert timing configuration
  ALERT_COOLDOWN_MINUTES: string; // e.g., "60" - time between duplicate alerts
  CHECK_INTERVAL_MINUTES: string; // e.g., "10" - how far back to check for metrics
  BASELINE_PERIOD_HOURS: string; // e.g., "1" - how far back to get baseline for comparison
  KV_TTL_DAYS: string; // e.g., "7" - how long to keep alert state in KV

  // API query limits
  LANGSMITH_QUERY_LIMIT: string; // e.g., "1000" - max runs to fetch per query

  // Cloudflare API access
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ACCOUNT_ID: string;

  // LangSmith API access
  LANGSMITH_API_KEY: string;
  LANGSMITH_PROJECT: string;
  LANGSMITH_ENDPOINT?: string;
}

// Re-export for convenience
export type { Anomaly as AnomalyType, AlertingEnv as AlertingEnvType };

import type {
  Anomaly,
  CloudflareMetrics,
  LangSmithMetrics,
  Thresholds
} from "./types";

// Default thresholds - can be overridden via environment variables
export const DEFAULT_THRESHOLDS: Thresholds = {
  errorRatePercent: 5, // 5% error rate
  p95LatencyMs: 2000, // 2 seconds
  p99LatencyMs: 3000, // 3 seconds
  trafficSpikeMultiplier: 2.0, // 200% of baseline
  llmErrorRatePercent: 10, // 10% LLM error rate
  llmP95LatencyMs: 20000, // 20 seconds
  llmTokenSpikeMultiplier: 3.0 // 300% of baseline
};

export function checkCloudflareAnomalies(
  current: CloudflareMetrics,
  baseline: CloudflareMetrics | null,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Check error rate
  if (current.errorRate > thresholds.errorRatePercent) {
    anomalies.push({
      type: "high_error_rate",
      severity: "high",
      message: `Error rate is ${current.errorRate.toFixed(2)}% (threshold: ${thresholds.errorRatePercent}%)`,
      value: current.errorRate,
      threshold: thresholds.errorRatePercent,
      timestamp: current.timestamp
    });
  }

  // Check P95 latency
  if (current.p95Latency > thresholds.p95LatencyMs) {
    anomalies.push({
      type: "high_latency",
      severity: "high",
      message: `P95 latency is ${current.p95Latency.toFixed(0)}ms (threshold: ${thresholds.p95LatencyMs}ms)`,
      value: current.p95Latency,
      threshold: thresholds.p95LatencyMs,
      timestamp: current.timestamp
    });
  }

  // Check P99 latency
  if (current.p99Latency > thresholds.p99LatencyMs) {
    anomalies.push({
      type: "high_latency",
      severity: "high",
      message: `P99 latency is ${current.p99Latency.toFixed(0)}ms (threshold: ${thresholds.p99LatencyMs}ms)`,
      value: current.p99Latency,
      threshold: thresholds.p99LatencyMs,
      timestamp: current.timestamp
    });
  }

  // Check traffic spike (if we have baseline)
  if (baseline && baseline.requestCount > 0) {
    const trafficRatio = current.requestCount / baseline.requestCount;
    if (trafficRatio > thresholds.trafficSpikeMultiplier) {
      anomalies.push({
        type: "traffic_spike",
        severity: "default",
        message: `Traffic is ${trafficRatio.toFixed(1)}x baseline (${current.requestCount} vs ${baseline.requestCount} requests)`,
        value: trafficRatio,
        threshold: thresholds.trafficSpikeMultiplier,
        timestamp: current.timestamp
      });
    }
  }

  return anomalies;
}

export function checkLangSmithAnomalies(
  current: LangSmithMetrics,
  baseline: LangSmithMetrics | null,
  thresholds: Thresholds = DEFAULT_THRESHOLDS
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Check LLM error rate
  if (current.errorRate > thresholds.llmErrorRatePercent) {
    anomalies.push({
      type: "llm_error_rate",
      severity: "high",
      message: `LLM error rate is ${current.errorRate.toFixed(2)}% (${current.errorCount}/${current.totalRuns} runs failed)`,
      value: current.errorRate,
      threshold: thresholds.llmErrorRatePercent,
      timestamp: current.timestamp
    });
  }

  // Check LLM P95 latency
  if (current.p95Latency > thresholds.llmP95LatencyMs) {
    anomalies.push({
      type: "llm_latency",
      severity: "high",
      message: `LLM P95 latency is ${(current.p95Latency / 1000).toFixed(2)}s (threshold: ${thresholds.llmP95LatencyMs / 1000}s)`,
      value: current.p95Latency,
      threshold: thresholds.llmP95LatencyMs,
      timestamp: current.timestamp
    });
  }

  // Check token usage spike (if we have baseline)
  if (baseline && baseline.avgTokensPerRun > 0) {
    const tokenRatio = current.avgTokensPerRun / baseline.avgTokensPerRun;
    if (tokenRatio > thresholds.llmTokenSpikeMultiplier) {
      anomalies.push({
        type: "llm_high_tokens",
        severity: "default",
        message: `Token usage is ${tokenRatio.toFixed(1)}x baseline (${current.avgTokensPerRun.toFixed(0)} vs ${baseline.avgTokensPerRun.toFixed(0)} tokens/run)`,
        value: tokenRatio,
        threshold: thresholds.llmTokenSpikeMultiplier,
        timestamp: current.timestamp
      });
    }
  }

  return anomalies;
}

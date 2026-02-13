import type { LangSmithMetrics, AlertingEnv } from "../types";

interface LangSmithResponse {
  runs?: LangSmithRun[];
}

interface LangSmithRun {
  id: string;
  status: string; // "success" | "error" | ...
  latency?: number; // milliseconds
  total_tokens?: number;
  start_time: string;
  end_time?: string;
}

export class LangSmithClient {
  private readonly apiKey: string;
  private readonly project: string;
  private readonly endpoint: string;
  private readonly checkIntervalMinutes: number;
  private readonly queryLimit: number;

  constructor(env: AlertingEnv) {
    this.apiKey = env.LANGSMITH_API_KEY;
    this.project = env.LANGSMITH_PROJECT;
    this.endpoint = env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    this.checkIntervalMinutes = parseInt(
      env.CHECK_INTERVAL_MINUTES || "10",
      10
    );
    this.queryLimit = parseInt(env.LANGSMITH_QUERY_LIMIT || "1000", 10);
  }

  async getMetrics(
    minutesAgo: number = this.checkIntervalMinutes
  ): Promise<LangSmithMetrics | null> {
    const now = new Date();
    const startTime = new Date(now.getTime() - minutesAgo * 60 * 1000);

    try {
      // Query runs from the last N minutes
      const url = new URL(`${this.endpoint}/runs`);
      url.searchParams.set("project", this.project);
      url.searchParams.set("start_time", startTime.toISOString());
      url.searchParams.set("end_time", now.toISOString());
      url.searchParams.set("limit", this.queryLimit.toString());

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(
          `LangSmith API error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as LangSmithResponse;
      const runs: LangSmithRun[] = data.runs || [];

      if (runs.length === 0) {
        return null;
      }

      // Calculate metrics
      const totalRuns = runs.length;
      const errorCount = runs.filter((r) => r.status === "error").length;
      const errorRate = (errorCount / totalRuns) * 100;

      // Calculate latencies
      const latencies = runs
        .map((r) => {
          if (r.latency) return r.latency;
          if (r.end_time && r.start_time) {
            return (
              new Date(r.end_time).getTime() - new Date(r.start_time).getTime()
            );
          }
          return null;
        })
        .filter((l): l is number => l !== null);

      const avgLatency =
        latencies.length > 0
          ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
          : 0;

      // Calculate P95
      const sortedLatencies = latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(sortedLatencies.length * 0.95);
      const p95Latency =
        sortedLatencies.length > 0 ? sortedLatencies[p95Index] || 0 : 0;

      // Calculate token usage
      const totalTokens = runs.reduce(
        (sum, r) => sum + (r.total_tokens || 0),
        0
      );
      const avgTokensPerRun = totalRuns > 0 ? totalTokens / totalRuns : 0;

      return {
        totalRuns,
        errorCount,
        errorRate,
        avgLatency,
        p95Latency,
        totalTokens,
        avgTokensPerRun,
        timestamp: now
      };
    } catch (error) {
      console.error("Failed to fetch LangSmith metrics:", error);
      throw error;
    }
  }

  async getBaselineMetrics(
    hoursAgo: number = 1
  ): Promise<LangSmithMetrics | null> {
    // Get metrics from N hours ago for baseline comparison
    const endTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    // Use same check interval window for baseline
    const startTime = new Date(
      endTime.getTime() - this.checkIntervalMinutes * 60 * 1000
    );

    try {
      const url = new URL(`${this.endpoint}/runs`);
      url.searchParams.set("project", this.project);
      url.searchParams.set("start_time", startTime.toISOString());
      url.searchParams.set("end_time", endTime.toISOString());
      url.searchParams.set("limit", this.queryLimit.toString());

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-API-Key": this.apiKey,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as LangSmithResponse;
      const runs: LangSmithRun[] = data.runs || [];

      if (runs.length === 0) {
        return null;
      }

      const totalRuns = runs.length;
      const totalTokens = runs.reduce(
        (sum, r) => sum + (r.total_tokens || 0),
        0
      );
      const avgTokensPerRun = totalRuns > 0 ? totalTokens / totalRuns : 0;

      return {
        totalRuns,
        errorCount: 0,
        errorRate: 0,
        avgLatency: 0,
        p95Latency: 0,
        totalTokens,
        avgTokensPerRun,
        timestamp: endTime
      };
    } catch (error) {
      console.error("Failed to fetch baseline LangSmith metrics:", error);
      return null;
    }
  }
}

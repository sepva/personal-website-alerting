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
  private sessionId: string | null = null;

  constructor(env: AlertingEnv) {
    this.apiKey = env.LANGSMITH_API_KEY;
    this.project = env.LANGSMITH_PROJECT;
    this.endpoint = env.LANGSMITH_ENDPOINT || "https://api.smith.langchain.com";
    this.checkIntervalMinutes = parseInt(
      env.CHECK_INTERVAL_MINUTES || "10",
      10
    );
    this.queryLimit = parseInt(env.LANGSMITH_QUERY_LIMIT || "100", 10);
  }

  private async getSessionId(): Promise<string> {
    if (this.sessionId) {
      return this.sessionId;
    }

    // Query sessions to find the project by name
    const url = new URL(`${this.endpoint}/api/v1/sessions`);
    url.searchParams.set("name", this.project);
    url.searchParams.set("limit", "1");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-api-key": this.apiKey,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Failed to get session ID: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error(`Project "${this.project}" not found`);
    }

    const id = data[0].id;
    this.sessionId = id;
    return id;
  }

  async getMetrics(
    minutesAgo: number = this.checkIntervalMinutes
  ): Promise<LangSmithMetrics | null> {
    const now = new Date();
    const startTime = new Date(now.getTime() - minutesAgo * 60 * 1000);

    try {
      const sessionId = await this.getSessionId();
      
      // Query runs from the last N minutes using POST /api/v1/runs/query
      const url = new URL(`${this.endpoint}/api/v1/runs/query`);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          session: [sessionId],
          start_time: startTime.toISOString(),
          limit: Math.min(this.queryLimit, 100)
        })
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
      const sessionId = await this.getSessionId();
      
      const url = new URL(`${this.endpoint}/api/v1/runs/query`);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          session: [sessionId],
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          limit: Math.min(this.queryLimit, 100)
        })
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

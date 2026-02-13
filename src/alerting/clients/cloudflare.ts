import type { CloudflareMetrics, AlertingEnv } from "../types";

interface GraphQLResponse {
  data?: {
    viewer?: {
      accounts?: Array<{
        workersInvocationsAdaptive?: Array<{
          sum?: {
            requests?: number;
            errors?: number;
            subrequests?: number;
          };
          quantiles?: {
            cpuTimeP50?: number;
            cpuTimeP95?: number;
            cpuTimeP99?: number;
            wallTimeP50?: number;
            wallTimeP95?: number;
            wallTimeP99?: number;
          };
        }>;
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

export class CloudflareAnalyticsClient {
  private readonly apiToken: string;
  private readonly accountId: string;
  private readonly endpoint = "https://api.cloudflare.com/client/v4/graphql";
  private readonly checkIntervalMinutes: number;

  constructor(env: AlertingEnv) {
    this.apiToken = env.CLOUDFLARE_API_TOKEN;
    this.accountId = env.CLOUDFLARE_ACCOUNT_ID;
    this.checkIntervalMinutes = parseInt(
      env.CHECK_INTERVAL_MINUTES || "10",
      10
    );
  }

  async getMetrics(
    minutesAgo: number = this.checkIntervalMinutes
  ): Promise<CloudflareMetrics | null> {
    const now = new Date();
    const startTime = new Date(now.getTime() - minutesAgo * 60 * 1000);

    const query = `
			query GetWorkersAnalytics($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!) {
				viewer {
					accounts(filter: { accountTag: $accountTag }) {
						workersInvocationsAdaptive(
							filter: {
								datetime_geq: $datetimeStart
								datetime_leq: $datetimeEnd
							}
							limit: 1
						) {
							sum {
								requests
								errors
								subrequests
							}
							quantiles {
								cpuTimeP50
								cpuTimeP95
								cpuTimeP99
								wallTimeP50
								wallTimeP95
								wallTimeP99
							}
						}
					}
				}
			}
		`;

    const variables = {
      accountTag: this.accountId,
      datetimeStart: startTime.toISOString(),
      datetimeEnd: now.toISOString()
    };

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) {
        throw new Error(
          `Cloudflare GraphQL API error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as GraphQLResponse;

      if (data.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
      }

      const metrics =
        data.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0];

      if (!metrics) {
        return null;
      }

      const requestCount = metrics.sum?.requests || 0;
      const errors = metrics.sum?.errors || 0;
      const errorRate = requestCount > 0 ? (errors / requestCount) * 100 : 0;

      return {
        requestCount,
        errorRate,
        // Wall time is returned in microseconds by Cloudflare API, convert to milliseconds
        p95Latency: (metrics.quantiles?.wallTimeP95 || 0) / 1000,
        p99Latency: (metrics.quantiles?.wallTimeP99 || 0) / 1000,
        errors5xx: errors, // Cloudflare doesn't separate 4xx/5xx in this dataset
        errors4xx: 0,
        timestamp: now
      };
    } catch (error) {
      console.error("Failed to fetch Cloudflare metrics:", error);
      throw error;
    }
  }

  async getBaselineMetrics(
    hoursAgo: number = 1
  ): Promise<CloudflareMetrics | null> {
    // Get metrics from N hours ago for baseline comparison
    const endTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    // Use same check interval window for baseline
    const startTime = new Date(
      endTime.getTime() - this.checkIntervalMinutes * 60 * 1000
    );

    const query = `
			query GetWorkersAnalytics($accountTag: string!, $datetimeStart: string!, $datetimeEnd: string!) {
				viewer {
					accounts(filter: { accountTag: $accountTag }) {
						workersInvocationsAdaptive(
							filter: {
								datetime_geq: $datetimeStart
								datetime_leq: $datetimeEnd
							}
							limit: 1
						) {
							sum {
								requests
								errors
							}
						}
					}
				}
			}
		`;

    const variables = {
      accountTag: this.accountId,
      datetimeStart: startTime.toISOString(),
      datetimeEnd: endTime.toISOString()
    };

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as GraphQLResponse;
      const metrics =
        data.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive?.[0];

      if (!metrics) {
        return null;
      }

      const requestCount = metrics.sum?.requests || 0;
      const errors = metrics.sum?.errors || 0;
      const errorRate = requestCount > 0 ? (errors / requestCount) * 100 : 0;

      return {
        requestCount,
        errorRate,
        p95Latency: 0,
        p99Latency: 0,
        errors5xx: errors,
        errors4xx: 0,
        timestamp: endTime
      };
    } catch (error) {
      console.error("Failed to fetch baseline metrics:", error);
      return null;
    }
  }
}

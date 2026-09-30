/**
 * Environment types for the alerting worker
 * This is separate from the main worker's env.d.ts
 */

declare namespace Cloudflare {
	interface AlertingEnv {
		// KV namespace for alert state
		ALERT_STATE: KVNamespace;

		// Environment variables
		NTFY_TOPIC: string;
		NTFY_BASE_URL?: string;
		NTFY_TOKEN?: string;
		ALERT_COOLDOWN_MINUTES: string;

		// Cloudflare API access
		CLOUDFLARE_API_TOKEN: string;
		CLOUDFLARE_ACCOUNT_ID: string;

		// LangSmith API access
		LANGSMITH_API_KEY: string;
		LANGSMITH_PROJECT: string;
		LANGSMITH_ENDPOINT?: string;
	}
}

// Export for use in TypeScript files
export type AlertingEnv = Cloudflare.AlertingEnv;

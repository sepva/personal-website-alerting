# Website Alerting System

A lightweight, scheduled Cloudflare Worker that monitors your website metrics and sends push notifications when anomalies are detected.

## Quick Start

```bash
# 1. Set up secrets (copy .dev.vars file first)
npm run set_secrets

# 2. Test locally
npm run test

# 3. Deploy to Cloudflare
npm run deploy

# 4. Monitor logs
npm run tail
```

See [SETUP.md](./SETUP.md) for detailed setup instructions.

## Available NPM Scripts

| Script                | Command                       | Description                                 |
| --------------------- | ----------------------------- | ------------------------------------------- |
| `npm run set_secrets` | Push secrets from `.dev.vars` | Upload secrets to Cloudflare                |
| `npm run test`        | Run test locally              | Simulate scheduled event with local secrets |
| `npm run dev`         | Dev mode with hot-reload      | Run worker locally with test-scheduled flag |
| `npm run deploy`      | Deploy to Cloudflare          | Deploy the alerting worker                  |
| `npm run tail`        | Monitor live logs             | Tail logs from production worker            |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Scheduled Worker                          │
│                   (every 10 minutes)                         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐   │
│  │              scheduler.ts (main)                    │   │
│  │  1. Fetch Cloudflare Analytics via GraphQL         │   │
│  │  2. Fetch LangSmith metrics via REST API           │   │
│  │  3. Compare against thresholds                      │   │
│  │  4. Check KV for alert cooldown                     │   │
│  │  5. Send ntfy notification if needed                │   │
│  │  6. Update KV with alert state                      │   │
│  └────────────────────────────────────────────────────┘   │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┏━━━━━━━━━━━┓   ┏━━━━━━━━━━┓   ┏━━━━━━━━━━┓
    ┃ Cloudflare ┃   ┃ LangSmith ┃   ┃   KV     ┃
    ┃ Analytics  ┃   ┃   API     ┃   ┃ Storage  ┃
    ┗━━━━━━━━━━━┛   ┗━━━━━━━━━━┛   ┗━━━━━━━━━━┛
            │               │
            └───────┬───────┘
                    ▼
            ┏━━━━━━━━━━━━━┓
            ┃  Your Phone  ┃
            ┃  (ntfy app)  ┃
            ┗━━━━━━━━━━━━━┛
```

## Components

### Core Files

- **[scheduler.ts](./scheduler.ts)** - Main entry point with `scheduled()` handler
- **[thresholds.ts](./thresholds.ts)** - Anomaly detection logic and threshold definitions
- **[state.ts](./state.ts)** - KV-based alert deduplication with cooldown
- **[notifier.ts](./notifier.ts)** - ntfy HTTP client with formatting

### Clients

- **[clients/cloudflare.ts](./clients/cloudflare.ts)** - GraphQL queries for Workers Analytics
- **[clients/langsmith.ts](./clients/langsmith.ts)** - REST API client for LangSmith runs

### Types

- **[types/index.ts](./types/index.ts)** - TypeScript interfaces for metrics, anomalies, and env

## Monitored Metrics

### Cloudflare Workers

- **Error Rate**: Percentage of failed requests
- **P95/P99 Latency**: Response time percentiles
- **Traffic Spikes**: Requests vs baseline (1 hour ago)

### LangSmith (LLM)

- **Error Rate**: Failed LLM runs percentage
- **P95 Latency**: LLM response time
- **Token Usage**: Average tokens per run vs baseline

## Default Thresholds

```typescript
{
  errorRatePercent: 5,              // 5% error rate
  p95LatencyMs: 2000,               // 2 seconds
  p99LatencyMs: 3000,               // 3 seconds
  trafficSpikeMultiplier: 2.0,      // 200% of baseline
  llmErrorRatePercent: 10,          // 10% LLM error rate
  llmP95LatencyMs: 10000,           // 10 seconds
  llmTokenSpikeMultiplier: 3.0      // 300% of baseline
}
```

## Alert Deduplication

- Alerts are stored in KV with 60-minute cooldown (configurable)
- Same anomaly type won't alert again within cooldown period
- Prevents notification spam during persistent issues
- State expires after 7 days automatically

## Notification Priorities

- **High Priority**: Error rates, high latency (red notification)
- **Default Priority**: Traffic spikes, token usage (normal notification)

## Free Tier Usage

| Resource        | Daily Usage | Free Limit | % Used |
| --------------- | ----------- | ---------- | ------ |
| Worker Requests | 144         | 100,000    | 0.14%  |
| KV Reads        | ~144        | 100,000    | 0.14%  |
| KV Writes       | ~10         | 1,000      | 1%     |
| GraphQL Queries | 144         | 43,200     | 0.33%  |
| Cron Triggers   | 1           | 5          | 20%    |

**Total Cost: $0/month** ✅

## Development

### Local Testing

Test the scheduled handler locally:

```bash
wrangler dev --config wrangler.alerting.jsonc --test-scheduled
```

Or trigger manually:

```bash
curl "http://localhost:8787/__scheduled"
```

### Deployment

```bash
wrangler deploy --config wrangler.alerting.jsonc
```

### View Logs

```bash
wrangler tail personal-website-alerting --config wrangler.alerting.jsonc
```

### Testing with Lower Thresholds

Temporarily modify [thresholds.ts](./thresholds.ts):

```typescript
export const DEFAULT_THRESHOLDS: Thresholds = {
  errorRatePercent: 0.1 // Very low - will trigger easily
  // ...
};
```

Redeploy and wait for next cron run.

## Configuration

All configuration is managed through environment variables - no magic numbers in the code!

📖 **See [CONFIG.md](./CONFIG.md) for complete configuration reference** with examples and best practices.

### Quick Reference

All values in [wrangler.alerting.jsonc](../../wrangler.alerting.jsonc):

### Notification Settings

- **NTFY_TOPIC**: Your unique ntfy topic name
- **NTFY_BASE_URL**: ntfy server URL (default: https://ntfy.sh)

### Alert Timing (all configurable!)

- **CHECK_INTERVAL_MINUTES**: How far back to check current metrics (default: 10)
- **BASELINE_PERIOD_HOURS**: How far back to fetch baseline for comparison (default: 1)
- **ALERT_COOLDOWN_MINUTES**: Minutes between duplicate alerts (default: 60)
- **KV_TTL_DAYS**: How long to keep alert state in KV storage (default: 7)

### API Configuration

- **LANGSMITH_QUERY_LIMIT**: Max LangSmith runs to fetch per query (default: 1000)
- **CLOUDFLARE_ACCOUNT_ID**: Your Cloudflare account ID

### Secrets (set via `wrangler secret put`)

- **CLOUDFLARE_API_TOKEN**: Workers Analytics read permission
- **LANGSMITH_API_KEY**: Your LangSmith API key
- **LANGSMITH_PROJECT**: Your LangSmith project name
- **LANGSMITH_ENDPOINT**: (optional) LangSmith API endpoint
- **NTFY_TOKEN**: (optional) ntfy authentication token

## Customization

### Adding New Anomaly Types

1. Add new type to [types/index.ts](./types/index.ts):

   ```typescript
   type: "your_new_type";
   ```

2. Add detection logic to [thresholds.ts](./thresholds.ts)

3. Add to alert state keys in [state.ts](./state.ts)

### Changing Alert Format

Modify [notifier.ts](./notifier.ts) methods:

- `formatTitle()` - Notification title
- `formatMessage()` - Notification body
- `determineTags()` - Emoji tags

### Adjusting Timing

All timing is configurable via environment variables in [wrangler.alerting.jsonc](../../wrangler.alerting.jsonc):

**Use case: More frequent checks**

```jsonc
"CHECK_INTERVAL_MINUTES": "5"  // Check last 5 minutes instead of 10
```

Note: Update your cron trigger to match: `"crons": ["*/5 * * * *"]`

**Use case: Longer baseline comparison**

```jsonc
"BASELINE_PERIOD_HOURS": "24"  // Compare against yesterday's traffic
```

**Use case: Reduce alert noise**

```jsonc
"ALERT_COOLDOWN_MINUTES": "120"  // Only alert every 2 hours
```

**Use case: More historical data**

```jsonc
"KV_TTL_DAYS": "30"  // Keep alert state for 30 days
```

**Use case: High traffic LLM app**

```jsonc
"LANGSMITH_QUERY_LIMIT": "5000"  // Fetch more runs per query
```

## Troubleshooting

See [SETUP.md](./SETUP.md#troubleshooting) for common issues and solutions.

## Future Enhancements

Potential improvements (all staying in free tier):

- [ ] Weekly digest of metrics via email
- [ ] Custom metrics via Analytics Engine
- [ ] Slack/Discord integration
- [ ] Status page generation
- [ ] Historical trend analysis

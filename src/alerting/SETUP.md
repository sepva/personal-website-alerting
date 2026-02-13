# Alerting System Setup Guide

This guide will help you deploy the alerting system that monitors your website and sends notifications via ntfy.

## Prerequisites

- Cloudflare account with Workers
- ntfy app installed on your phone (iOS/Android)
- LangSmith account with API key

## Step 1: Set up ntfy

1. **Install the ntfy app** on your phone from the App Store or Google Play (free)

2. **Create a unique topic name** (e.g., `seppe-website-alerts-2026`)
   - Make it unique to avoid conflicts with others
   - No account needed for basic use

3. **Subscribe to your topic** in the ntfy app:
   - Open the app
   - Tap the "+" button
   - Enter your topic name
   - Tap "Subscribe"

4. **Test it works**:

   ```bash
   curl -d "Test alert from terminal" https://ntfy.sh/YOUR-TOPIC-NAME
   ```

   - You should receive a notification on your phone within seconds

## Step 2: Create KV Namespace

Create the KV namespace for storing alert state:

```bash
npx wrangler kv namespace create ALERT_STATE
```

This will output something like:

```
🌀 Creating namespace with title "personal-website-alerting-ALERT_STATE"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "ALERT_STATE", id = "abc123..." }
```

Copy the `id` value and update it in [wrangler.jsonc](../wrangler.jsonc):

```jsonc
"kv_namespaces": [
  {
    "binding": "ALERT_STATE",
    "id": "abc123..."  // <- Replace with your actual ID
  }
]
```

## Step 3: Get Cloudflare Account ID

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click on "Workers & Pages" in the left sidebar
3. Your Account ID is shown in the URL: `dash.cloudflare.com/YOUR_ACCOUNT_ID/workers-and-pages`
4. Copy this ID and update [wrangler.jsonc](../wrangler.jsonc):

```jsonc
"vars": {
  "CLOUDFLARE_ACCOUNT_ID": "YOUR_ACCOUNT_ID"  // <- Replace here
}
```

## Step 4: Create Cloudflare API Token

1. Go to [Cloudflare Dashboard > API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Create Custom Token" template
4. Set permissions:
   - **Account** > **Account Analytics** > **Read**
5. Click "Continue to summary" and "Create Token"
6. Copy the token (you won't see it again!)

## Step 5: Configure Secrets

Create a `.dev.vars` file in the project root with your secrets:

```env
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_from_step_4
LANGSMITH_API_KEY=your_langsmith_api_key
LANGSMITH_PROJECT=your_langsmith_project_name
```

Then push all secrets to Cloudflare at once:

```bash
npm run set_secrets
```

This runs `wrangler secret bulk .dev.vars` to push all secrets.

**Note**: The `.dev.vars` file should be in your `.gitignore` (it should already be ignored).

## Step 6: Test Locally (Optional but Recommended)

Before deploying, test the alerting system locally:

```bash
npm run test
```

This will:

- Load your `.dev.vars` secrets
- Simulate a scheduled event
- Run the alerting logic locally
- Show you any anomalies detected or errors

You can also run the worker in dev mode:

```bash
npm run dev
```

This starts the worker locally with hot-reloading and allows you to manually trigger scheduled events.

## Step 7: Update Configuration

Edit [wrangler.jsonc](../wrangler.jsonc) and set your configuration:

```jsonc
"vars": {
  // Notification settings
  "NTFY_TOPIC": "your-actual-topic-name",  // <- Replace with your topic from Step 1
  "NTFY_BASE_URL": "https://ntfy.sh",

  // Alert timing configuration (all configurable!)
  "ALERT_COOLDOWN_MINUTES": "60",          // Time between duplicate alerts
  "CHECK_INTERVAL_MINUTES": "10",          // How far back to check metrics (matches cron)
  "BASELINE_PERIOD_HOURS": "1",            // How far back for baseline comparison
  "KV_TTL_DAYS": "7",                      // How long to keep alert state

  // API limits
  "LANGSMITH_QUERY_LIMIT": "1000",         // Max LangSmith runs per query

  // Account
  "CLOUDFLARE_ACCOUNT_ID": "your-account-id"  // <- From Step 3
}
```

## Step 8: Deploy the Alerting Worker

Deploy the alerting worker to Cloudflare:

```bash
npm run deploy
```

This runs `wrangler deploy` and will:

- Create a new worker named `personal-website-alerting`
- Set up the cron trigger to run every 10 minutes
- Use 1 of your 5 free cron triggers
- Use 1 of your 100 free workers

## Step 9: Verify Deployment

1. **Check the dashboard**:
   - Go to [Cloudflare Dashboard > Workers & Pages](https://dash.cloudflare.com/)
   - You should see `personal-website-alerting` in the list
   - Click on it > "Triggers" tab
   - Verify the cron trigger is set to `*/10 * * * *`

2. **Monitor logs**:

   ```bash
   npm run tail
   ```

   Wait up to 10 minutes for the next scheduled run. You'll see logs like:

   ```
   [Alerting] Scheduled run at 2026-02-12T14:30:00.000Z
   [Alerting] Cloudflare: 0 anomalies detected
   [Alerting] LangSmith: 0 anomalies detected
   [Alerting] No anomalies detected
   ```

3. **Test with lower thresholds** (optional):
   - Temporarily set very low thresholds to trigger a test alert
   - You can do this by modifying [thresholds.ts](./thresholds.ts) DEFAULT_THRESHOLDS
   - Redeploy: `npm run deploy`
   - Wait for next cron run
   - You should receive a notification on your phone
   - Revert the thresholds and redeploy

## Customizing Thresholds

Edit [thresholds.ts](./thresholds.ts) to adjust sensitivity:

```typescript
export const DEFAULT_THRESHOLDS: Thresholds = {
  errorRatePercent: 5, // Alert if >5% error rate
  p95LatencyMs: 2000, // Alert if P95 > 2 seconds
  p99LatencyMs: 3000, // Alert if P99 > 3 seconds
  trafficSpikeMultiplier: 2.0, // Alert if traffic >2x baseline
  llmErrorRatePercent: 10, // Alert if LLM errors >10%
  llmP95LatencyMs: 10000, // Alert if LLM P95 > 10 seconds
  llmTokenSpikeMultiplier: 3.0 // Alert if tokens >3x baseline
};
```

After changes, redeploy:

```bash
npm run deploy
```

## Available NPM Scripts

For convenience, all alerting operations have npm scripts:

```bash
# Push secrets to Cloudflare
npm run set_secrets

# Test locally (simulates scheduled event)
npm run test

# Run in dev mode with hot-reloading
npm run dev

# Deploy to Cloudflare
npm run deploy

# Monitor live logs from production
npm run tail
```

## Monitoring Usage (Staying in Free Tier)

Check your usage to ensure you stay in free tier limits:

1. **Worker requests**: [Dashboard > Workers > personal-website-alerting > Metrics](https://dash.cloudflare.com/)
   - Should see ~144 requests/day (every 10 minutes)
   - Free tier: 100,000/day ✅

2. **KV operations**: Dashboard > KV > ALERT_STATE
   - ~144 reads/day + ~5-10 writes/day
   - Free tier: 100,000 reads/day, 1,000 writes/day ✅

3. **Cron triggers**: Dashboard > Workers > personal-website-alerting > Settings > Triggers
   - Using 1 of 5 free cron triggers ✅

## Troubleshooting

### No notifications received

1. Check logs:

   ```bash
   npm run alerting:tail
   ```

2. Verify ntfy topic is correct in [wrangler.alerting.jsonc](../wrangler.alerting.jsonc)

3. Test ntfy directly:
   ```bash
   curl -d "Manual test" https://ntfy.sh/YOUR-TOPIC-NAME
   ```

### Cloudflare API errors

- Verify API token has correct permissions (Account > Account Analytics > Read)
- Check token hasn't expired
- Verify Account ID is correct

### LangSmith API errors

- Verify LANGSMITH_API_KEY is set correctly
- Verify LANGSMITH_PROJECT name matches your project
- Check if project exists in LangSmith dashboard

### Too many/few alerts

Adjust thresholds in [thresholds.ts](../src/alerting/thresholds.ts) and redeploy.

## Disabling Alerts Temporarily

To temporarily disable alerts without deleting the worker:

1. Comment out the cron trigger in [wrangler.alerting.jsonc](../wrangler.alerting.jsonc):

   ```jsonc
   // "triggers": {
   //   "crons": ["*/10 * * * *"]
   // }
   ```

2. Redeploy:
   ```bash
   npm run alerting:deploy
   ```

## Uninstalling

To completely remove the alerting system:

```bash
# Delete the worker
wrangler delete personal-website-alerting --config wrangler.alerting.jsonc

# Delete the KV namespace (get ID from wrangler.alerting.jsonc)
wrangler kv namespace delete --namespace-id YOUR_KV_ID --config wrangler.alerting.jsonc

# Unsubscribe from ntfy topic in the app
```

## Cost Summary (Free Tier)

Everything in this setup is FREE:

| Service         | Usage          | Free Tier Limit | Used % |
| --------------- | -------------- | --------------- | ------ |
| Worker Requests | 144/day        | 100,000/day     | 0.14%  |
| Cron Triggers   | 1              | 5               | 20%    |
| KV Reads        | ~144/day       | 100,000/day     | 0.14%  |
| KV Writes       | ~10/day        | 1,000/day       | 1%     |
| GraphQL API     | 144/day        | 43,200/day      | 0.33%  |
| ntfy            | Unlimited push | ∞               | Free   |

**Total monthly cost: $0** 🎉

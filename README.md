# Personal Website Alerting

Scheduled Cloudflare Worker that monitors Cloudflare Workers analytics and LangSmith metrics, then sends ntfy push notifications when anomalies are detected.

## Features

- Scheduled checks via cron trigger
- Cloudflare Workers analytics + LangSmith metrics
- KV-backed alert deduplication with cooldown
- ntfy notifications with priorities
- Free-tier friendly usage

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create secrets file and fill it in:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Push secrets to Cloudflare:

   ```bash
   npm run set_secrets
   ```

4. Test locally:

   ```bash
   npm run test
   ```

5. Deploy:

   ```bash
   npm run deploy
   ```

6. Monitor logs:

   ```bash
   npm run tail
   ```

For full setup instructions, see [src/alerting/SETUP.md](src/alerting/SETUP.md).

## Project Layout

```
src/alerting/
  scheduler.ts    # Scheduled entrypoint
  thresholds.ts   # Anomaly detection and thresholds
  notifier.ts     # ntfy notification client
  state.ts        # KV-backed alert state
  clients/        # Cloudflare + LangSmith clients
  types/          # Shared types
```

## Configuration

Runtime config lives in [wrangler.jsonc](wrangler.jsonc). Secrets are loaded from `.dev.vars` (not committed) and uploaded with `npm run set_secrets`.

Common variables:

- `NTFY_TOPIC`, `NTFY_BASE_URL`
- `ALERT_COOLDOWN_MINUTES`, `CHECK_INTERVAL_MINUTES`, `BASELINE_PERIOD_HOURS`, `KV_TTL_DAYS`
- `LANGSMITH_QUERY_LIMIT`, `CLOUDFLARE_ACCOUNT_ID`

## Scripts

| Script | Description |
| --- | --- |
| `npm run set_secrets` | Upload secrets from `.dev.vars` |
| `npm run test` | Run local scheduled test |
| `npm run dev` | Run worker locally with scheduled flag |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run tail` | Tail production logs |
| `npm run types` | Generate Wrangler types |
| `npm run format` | Format project |
| `npm run check` | Lint + typecheck |

## Notes

- The worker runs on a cron schedule defined in [wrangler.jsonc](wrangler.jsonc).
- Alert state is stored in a KV namespace bound as `ALERT_STATE`.

## License

MIT

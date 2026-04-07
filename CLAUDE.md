# App Insights Explorer

## What This App Does

App Insights Explorer is an internal tool that queries Azure Application Insights telemetry, surfaces meaningful patterns, and uses Claude AI to triage signal from noise. It is designed for **dev teams** — not Ops or management — to catch application-level problems before customers or managers do.

## Architecture

### Stack
- **Frontend:** Next.js 16 / React 19, Tailwind CSS, port 3000
- **Backend:** NestJS (TypeScript), port 3001
- **AI:** Anthropic Claude API (`claude-sonnet-4-6`)
- **Data:** Azure Application Insights via `@azure/monitor-query` + KQL

### Structure
```
/
├── frontend/       # Next.js app (UI, query execution, AI analysis display)
├── backend/        # NestJS API (Azure SDK queries, Claude AI calls)
│   ├── src/
│   │   ├── app.controller.ts   # Main REST endpoints
│   │   ├── app.service.ts      # Query execution + AI analysis logic
│   │   ├── config.json         # Environments + App Insights resource IDs
│   │   └── queries.json        # KQL query library (~20 canned queries)
```

### API Endpoints
| Endpoint | Description |
|---|---|
| `GET /api/environments` | List configured environments |
| `GET /api/queries` | List available KQL queries by category |
| `POST /api/query` | Execute a KQL query against an environment |
| `POST /api/analyze` | Send query results to Claude for AI analysis |

### Environments
Six configured environments across two services:
- Deal Workflow V2 — Test, Staging, Production
- Inquiry Services — Test, Staging, Production

## Key Features

- **Pre-built KQL library** — exceptions, requests, dependencies, DealId tracking, correlation chains, sync failure patterns
- **Drill-down UX** — click an exception to drill into it; click a request to correlate all telemetry by `operation_Id`
- **AI analysis** — send any result set (all rows or a single row) to Claude for a plain-English diagnosis
- **Custom KQL** — run arbitrary queries with placeholder substitution (`{timeRange}`, `{binSize}`, etc.)
- **Auto-refresh** — 60s polling mode for live monitoring

## Planned: Proactive Teams Alerting

The next major feature is a scheduled notification service that:
- Reads team subscriptions (which teams care about which environments)
- Runs AI triage on a schedule (hourly spike detection + daily morning digest)
- Posts actionable, AI-summarized alerts to team-specific Teams channels
- Filters known/recurring noise so only genuinely new or accelerating issues surface

Config will live in `teams.config.json` at the project root, owned by tech leads.

## Proof of Concept Uses

This app is intentionally kept as a focused, self-contained tool to serve as a foundation for other POCs, including GitHub Actions integration and other AI-driven developer workflow experiments.

## CI/CD POC — Personal Account Setup (PLATFORM-44)

**Goal:** Demonstrate end-to-end GitHub Actions + Terraform + Azure CI/CD using personal accounts.

**This repo** (`C:\src\PersonalGit\app-insights-explorer`) is the working copy that gets pushed to personal GitHub. The original M&M version lives at `C:\src\app-insights-explorer`.

### What's been stripped / simplified vs. M&M version
- M&M App Insights resource IDs removed from `backend/src/config/config.json` (replaced with placeholders)
- Single environment (`test`) only — no staging, no production
- No approval gates — push to `development` → build → deploy
- No required PR reviewers (solo personal repo)
- No release pipeline

### Pipeline
| Workflow | Trigger | What it does |
|---|---|
| `pr.yml` | PR → `development` | Lint, test, Docker build (no push), `terraform plan` posted as comment |
| `ci.yml` | Push to `development` | Build + push to ACR, `terraform apply`, deploy to App Service, smoke test |

### IaC Structure
```
infra/
├── shared/          # ACR, OIDC federated credentials, SSO App Reg, GitHub Variables, branch protection
└── envs/
    └── test/        # App Service plan + web + api apps + Key Vault
```

### Bootstrap Sequence (one-time)
1. `az login` with personal Microsoft account
2. `./build-release/scripts/bootstrap.sh` — creates TF state storage + CI/CD Service Principal
3. Set 5 GitHub Actions Variables shown at end of bootstrap output
4. `terraform apply infra/shared/` — provisions ACR, OIDC, SSO App Reg, branch protection, GitHub env
5. Bootstrap Key Vault secrets manually (SSO client ID/secret, Anthropic key, etc.)
6. `terraform apply infra/envs/test/` — provisions App Service plan + web/api apps
7. Push to `development` → watch CI run end to end

### Known Gap
`backend/src/` only has config files — NestJS source files (app.controller.ts, app.service.ts, etc.) need to be added for the Docker build to succeed.

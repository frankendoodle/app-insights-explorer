# App Insights Explorer

An AI-powered telemetry analysis tool for dev teams. Queries Azure Application Insights, surfaces meaningful patterns, and uses Claude AI to separate actionable errors from background noise — delivered to the right team before customers or management notice.

## The Problem

Your organization likely already has Azure Application Insights and possibly Grafana. So why build this?

### What Azure Alerts and Grafana Do Well

- Fire when a metric crosses a threshold (error rate > 5%, latency > 2s)
- Great for infrastructure-level monitoring (CPU, memory, availability)
- Reliable and low-maintenance
- Configured once by Ops, visible to everyone

### Why They Fall Short for Dev Teams

Threshold-based alerts answer *"did X exceed Y?"* — they cannot answer *"does this matter?"*

The result: dev teams get paged for the same recurring known errors, ignore the alerts, and miss the one new exception that actually matters. Management and customers end up reporting problems that telemetry already showed.

### What This App Adds

| Capability | Azure Alerts | Grafana | App Insights Explorer |
|---|---|---|---|
| Fires when count exceeds threshold | ✅ | ✅ | ✅ |
| Detects **new** exception types | ❌ | ❌ | ✅ |
| Filters known/recurring noise | ❌ | ❌ | ✅ |
| Reads stack traces semantically | ❌ | ❌ | ✅ |
| Explains *why* something matters | ❌ | ❌ | ✅ |
| Team-owned config (code, PRs) | ❌ | ❌ | ✅ |
| Morning digest, AI-summarized | ❌ | ❌ | ✅ |
| Cross-environment correlation | ❌ | Limited | ✅ |

**The one-liner:** Azure alerts tell you *that* something happened. This tells you *whether it matters and why* — and only notifies the team that owns it.

### This Is Not a Replacement for Grafana or Azure Alerts

Ops should keep their infrastructure alerts. This sits above that layer and handles **application-level semantic triage for dev teams**. Different problems, different audiences.

## Features

- **Interactive query explorer** — 20+ pre-built KQL queries across exceptions, requests, dependencies, DealId tracking, and correlation chains
- **Drill-down analysis** — click an exception to dig in; click a request to see the full operation timeline
- **AI analysis** — send any result set to Claude for a plain-English diagnosis with context
- **Multi-environment** — Test, Staging, and Production across Deal Workflow V2 and Inquiry Services
- **Proactive Teams alerting** *(planned)* — scheduled AI triage posted to team-specific Teams channels

## Getting Started

```bash
npm install
npm run dev
```

Frontend: http://localhost:3000
Backend API + Swagger: http://localhost:3001/api/docs

### Required Environment Variables

```
ANTHROPIC_API_KEY=your_api_key
```

Azure authentication uses `DefaultAzureCredential` — ensure you are logged in via `az login` or have a service principal configured.

## Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS
- **Backend:** NestJS (TypeScript)
- **AI:** Anthropic Claude API (`claude-sonnet-4-6`)
- **Data:** Azure Application Insights via `@azure/monitor-query` + KQL

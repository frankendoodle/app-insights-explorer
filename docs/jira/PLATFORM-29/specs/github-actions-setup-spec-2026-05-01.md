---
title: "GitHub Actions CI/CD Setup — Feature Spec"
ticket: PLATFORM-29
slug: github-actions-setup
discovery: specs/github-actions-setup-discovery.md
date: 2026-05-01
tags: [ai/generated, jira/feature-spec]
status: final
stale: false
---

# GitHub Actions CI/CD Setup — Feature Spec

## 1. Overview

This spec covers the creation of two GitHub Actions CI/CD workflows for the `app-insights-explorer` application, along with two supporting code changes in the NestJS API backend. Together these deliver a complete PR-gate and deployment pipeline targeting the hand-provisioned Azure test environment from PLATFORM-1.

The PR validation workflow (`pr.yml`) triggers on every pull request to the `development` branch. It builds both Docker images (frontend and API) without pushing to ACR, confirming the build is valid before any code reaches `development`. The CI deployment workflow (`ci.yml`) triggers on every merge to `development`. It authenticates to Azure via OIDC, builds and pushes versioned Docker images to ACR, deploys both App Services using the official GitHub Action, and runs a smoke test confirming both applications are responding. Each workflow step is written to be self-explanatory — following the same pedagogical approach used in PLATFORM-1.

Two backend changes are included in scope: adding a `GET /health` endpoint excluded from the global API key guard (required for the smoke test), and removing `excludeManagedIdentityCredential: true` from the NestJS `DefaultAzureCredential` constructor (required for the deployed application to query Azure Application Insights via managed identity).

## 2. Delivery Assessment

```
Readiness: Code-ready
Blocking Items:
- None — PLATFORM-1 infrastructure is complete; OIDC federated credential,
  ACR, App Services, Key Vault secrets, and managed identities are all in place
Decomposition:
- None identified — the PR workflow, CI workflow, health endpoint, and
  managed identity fix form a single coherent delivery unit
```

## 3. Technical Context

The Azure test environment was fully provisioned in PLATFORM-1. The relevant resources are:

| Resource | Name |
|---|---|
| Container Registry | `acrappinsightstest2` (login server: `acrappinsightstest2.azurecr.io`) |
| App Service Plan | `asp-aie-test-2` (B1, Linux) |
| Frontend Web App | `aie-web-test-2` (`https://aie-web-test-2.azurewebsites.net`) |
| API Web App | `aie-api-test-2` (`https://aie-api-test-2.azurewebsites.net`) |
| CI/CD Service Principal | `sp-app-insights-explorer-cicd-2` |
| OIDC Federated Credential | Scoped to `repo:frankendoodle/app-insights-explorer:ref:refs/heads/development` |

The application consists of two Docker containers with Dockerfiles already present at `frontend/Dockerfile` and `backend/Dockerfile`. The NestJS API has a global `ApiKeyGuard` applied via `APP_GUARD` — all routes require an `x-api-key` header. No health check endpoint currently exists.

A previous CI/CD attempt produced partial workflow files that were removed in PLATFORM-291. The `.github/workflows/` directory currently contains only a `.gitkeep` placeholder. A known code gap from PLATFORM-1 exists in the NestJS backend: `DefaultAzureCredential` is instantiated with `excludeManagedIdentityCredential: true`, which prevents the managed identity from functioning inside an App Service container.

## 4. Technical Scope

**GitHub Actions workflow files:**
- `.github/workflows/pr.yml` — build-only workflow triggered by PR to `development`
- `.github/workflows/ci.yml` — full build, push, deploy, and smoke test workflow triggered by push to `development`

**GitHub configuration (manual, pre-workflow):**
- Repository-level OIDC variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- Repository-level deployment variables: `ACR_LOGIN_SERVER`, `RESOURCE_GROUP`, `WEBAPP_FRONTEND`, `WEBAPP_API`
- `test` GitHub Environment created in repository settings

**Azure Container Registry:**
- Docker image build and push for frontend (`app-insights-explorer-frontend`) and API (`app-insights-explorer-api`)
- Tags applied: `:latest` and `:{short-git-sha}`

**Azure App Service:**
- Deployment of both web apps via `azure/webapps-deploy` GitHub Action
- App Services pull updated images from ACR using managed identity (`acrUseManagedIdentityCreds=true`)

**NestJS API backend (code changes):**
- Add `GET /health` endpoint returning HTTP 200, excluded from the global `ApiKeyGuard`
- Remove `excludeManagedIdentityCredential: true` from `DefaultAzureCredential` constructor options

## 5. Key Design Decisions

### Build-only PR workflow, deploy-only CI workflow

The PR workflow builds both Docker images without pushing to ACR. This catches Dockerfile and build errors before code reaches `development`, without consuming ACR storage or triggering a deployment. The CI workflow handles all push and deploy steps and only runs after a merge. This separation keeps the PR gate fast and cheap and makes the deployment path unambiguous — a developer reading the workflow files can immediately tell which file does what.

### OIDC authentication over stored credentials

The CI workflow authenticates to Azure using the OIDC federated credential provisioned in PLATFORM-1. GitHub generates a short-lived signed token at runtime; Azure exchanges it for an access token scoped to the CI/CD service principal's role assignments. No Azure credential is stored in GitHub's secret store. The OIDC credential is scoped exclusively to the `development` branch — pipeline runs from other branches cannot authenticate, which is intentional for this stage.

Azure login is absent from `pr.yml` because the PR workflow requires no Azure access — it builds images locally only. If Azure steps are ever added to `pr.yml` in the future (for example, a `terraform plan` comment), note that the current OIDC federated credential is scoped to the `development` branch and will not authorize pull request runs; a separate federated credential scoped to pull request events would be required.

### azure/webapps-deploy GitHub Action for deployment

After pushing images to ACR, the deploy step uses the official `azure/webapps-deploy` GitHub Action rather than raw `az webapp restart` or `az webapp config container set` commands. The Action is more structured than raw CLI, produces cleaner CI log output, and integrates with the GitHub Environment deployment history — the GitHub UI shows a timestamped record of each deployment and which commit triggered it.

### Image tagging: :latest + git SHA

Every image push applies two tags: `:latest` (always points to the most recently built image) and `:{short-git-sha}` (an immutable reference to the exact commit that produced the image, e.g., `:abc1234`). This eliminates the most common Docker deployment traceability gap — when something breaks in production, the SHA tag shows exactly which code is running.

### GET /health endpoint excluded from ApiKeyGuard

The smoke test requires an unauthenticated endpoint that returns HTTP 200 to confirm the API server is alive and the container started successfully. The previous approach of treating HTTP 401 as "healthy" masked the distinction between "server is responding" and "application started correctly." A dedicated `GET /health` endpoint excluded from the global guard provides a clear and unambiguous liveness signal that reads correctly in CI logs.

### Managed identity fix in scope

The NestJS `DefaultAzureCredential` exclusion of managed identity (`excludeManagedIdentityCredential: true`) is a hard blocker for the deployed application — inside an App Service container, only the managed identity credential is available, so this exclusion causes all Azure SDK calls (including Application Insights queries) to fail silently. Removing this one-line exclusion is included in PLATFORM-29 because it is a prerequisite for the deployment to produce a functioning application, not merely a passing pipeline.

## 6. Technical Dependencies

- **PLATFORM-1 infrastructure complete** — ACR, App Service Plan, both App Services, Key Vault with all secrets populated, managed identities with AcrPull and Key Vault Secrets User role assignments
- **OIDC federated credential** — `sp-app-insights-explorer-cicd-2` has a federated credential scoped to the `development` branch of `frankendoodle/app-insights-explorer` (PLATFORM-1 Task 12)
- **Contributor and AcrPush roles** — CI/CD service principal has Contributor at subscription scope and AcrPush at ACR scope (PLATFORM-1 Task 13)
- **GitHub repository** — `frankendoodle/app-insights-explorer` exists with a `development` branch
- **GitHub Actions OIDC variables set** (PLATFORM-292) — `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` as repository-level variables
- **GitHub Actions deployment variables set** (PLATFORM-293) — `ACR_LOGIN_SERVER`, `RESOURCE_GROUP`, `WEBAPP_FRONTEND`, `WEBAPP_API` as repository-level variables
- **`test` GitHub Environment created** (PLATFORM-294) — no approval gates, used by the deploy job in ci.yml for deployment history

## 7. Technical Concerns & Risks

**App Service cold start delay after deployment:** B1-tier App Services can take 30–90 seconds to pull a new image from ACR and restart the container after a deployment. The smoke test uses a defined retry strategy: a 60-second initial wait after the deploy step completes (covering the median B1 cold start duration), followed by curl with up to 5 retries and a 15-second delay between attempts. A failure is declared only after all retries are exhausted.

**OIDC credential scoped to development branch only:** The federated credential from PLATFORM-1 is bound to the `development` branch subject claim. The PR workflow requires no Azure access and so this constraint does not affect it today. If Azure steps are added to `pr.yml` in the future, a separate federated credential scoped to pull request events would be needed — the existing credential will not authorize those runs.

**Frontend smoke test accepts any non-5xx response:** The Next.js frontend redirects unauthenticated requests to the NextAuth login page (HTTP 302). The smoke test accepts any non-5xx HTTP response from the frontend root URL — a 200 or 302 both indicate the server is alive and routing correctly. A 5xx response indicates a startup failure or crash.

**App Service managed identity and ACR pull:** The App Services are configured to pull images from ACR using managed identity. If the `acrUseManagedIdentityCreds` setting is absent or the AcrPull role assignment is missing, the App Service will fail to pull the new image after deployment. The smoke test serves as the end-to-end signal confirming that the pull succeeded and the container started.

## 8. Non-Scope

- Terraform infrastructure provisioning — covered by PLATFORM-3
- Staging and production environments and their associated approval workflows
- ESLint or other linting steps — no lint configuration exists in the repository; adding one is a separate concern
- Automated test suite execution — no application test suite exists beyond the NestJS scaffold
- Branch protection rules on `development`
- Docker image vulnerability scanning
- Multi-environment pipeline configuration
- Notification or alerting on deployment failure
- Key Vault secret rotation or CI/CD secret management beyond what PLATFORM-1 established

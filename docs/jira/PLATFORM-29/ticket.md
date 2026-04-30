---
ticket: PLATFORM-29
fetched: 2026-04-30T15:10:00-07:00
jira_updated: 2026-04-30T15:02:43.744-0700
---

# PLATFORM-29 — Set up git actions for sample web application

| Field | Value |
|---|---|
| **Summary** | Set up git actions for sample web application |
| **Status** | Created |
| **Priority** | Medium |
| **Type** | Story |
| **Assignee** | Goulart, Frank |
| **Reporter** | Goulart, Frank |
| **Created** | 2026-04-23 |
| **Updated** | 2026-04-30 |
| **Labels** | — |
| **Sprint** | — |
| **Components** | — |

## Description

As a platform engineer, I want to set up GitHub Actions CI/CD workflows from scratch for the app-insights-explorer web application so that every pull request and every merge to `development` automatically builds, tests, and deploys the application to the Azure infrastructure provisioned in PLATFORM-1.

### Context

This story picks up where PLATFORM-1 left off. The Azure infrastructure now exists and is fully documented — resource group, ACR, App Service Plan, frontend and API web apps, Key Vault, managed identities, OIDC federated credentials, and all RBAC roles. This story establishes the automation layer that uses that infrastructure.

A previous iteration left behind partial yml files (`pr.yml`, `ci.yml`, plus staging configuration) that were created through trial and error. Those files are not a reliable foundation. This story removes all of that and builds the pipeline from scratch, step by step — the same way PLATFORM-1 built the infrastructure. Each subtask is a single, atomic piece of the pipeline so the developer understands what it does and why it exists before moving on to the next.

### Scope

This story covers deploying to the hand-provisioned test environment only. It does **not** introduce Terraform — the CI workflow deploys by pushing Docker images to ACR and restarting the App Services directly. Terraform comes in PLATFORM-3 when the hand-provisioned infrastructure is replaced with IaC.

**Related stories:**
- PLATFORM-1 — Provision web application infrastructure by hand (prerequisite — Done)
- PLATFORM-3 — Replace manual infrastructure with Terraform IaC (follow-on)

## Acceptance Criteria

- Given the old yml files exist, when this story begins, then they are removed and the repo has no CI/CD configuration.
- Given a PR is opened against `development`, when the PR workflow runs, then it builds both Docker images (no push) and the workflow completes successfully.
- Given a commit is merged to `development`, when the CI workflow runs, then it builds and pushes both images to ACR, deploys both App Services, and a smoke test confirms the apps are responding.
- Given the pipeline runs end-to-end, when another developer reads the workflow files, then each step is self-explanatory without additional guidance.

## Linked Issues

_(None)_

## Subtasks

| Key | Summary | Status |
|---|---|---|
| PLATFORM-291 | Remove legacy CI/CD files (pr.yml, ci.yml, staging ymls) | Created |
| PLATFORM-292 | Configure GitHub Actions OIDC variables (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID) | Created |
| PLATFORM-293 | Configure GitHub Actions deployment variables (ACR_LOGIN_SERVER, RESOURCE_GROUP, WEBAPP_FRONTEND, WEBAPP_API) | Created |
| PLATFORM-294 | Create test GitHub Environment in repo settings | Created |
| PLATFORM-295 | Create pr.yml — trigger on PR to development, job skeleton | Created |
| PLATFORM-296 | Add Docker build step for frontend image to pr.yml (no push) | Created |
| PLATFORM-297 | Add Docker build step for API image to pr.yml (no push) | Created |
| PLATFORM-298 | Create ci.yml — trigger on push to development, job skeleton | Created |
| PLATFORM-299 | Add OIDC Azure login step to ci.yml | Created |
| PLATFORM-300 | Add Docker build and push to ACR for frontend | Created |
| PLATFORM-301 | Add Docker build and push to ACR for API | Created |
| PLATFORM-302 | Add App Service deploy step for frontend | Created |
| PLATFORM-303 | Add App Service deploy step for API | Created |
| PLATFORM-304 | Add smoke test step (curl health check on both App Service URLs) | Created |
| PLATFORM-305 | Validate PR workflow with a test branch PR | Created |
| PLATFORM-306 | Validate CI workflow with a merge to development | Created |

## Comments

_(None)_

## Attachments

_(None)_

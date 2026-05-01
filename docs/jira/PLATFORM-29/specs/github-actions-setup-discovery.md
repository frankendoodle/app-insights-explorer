---
title: "GitHub Actions CI/CD Setup — Feature Discovery"
ticket: PLATFORM-29
slug: github-actions-setup
date: 2026-05-01
tags: [ai/generated, jira/discovery]
status: discovery_complete
specs:
  - slug: github-actions-setup
    file: specs/github-actions-setup-spec-2026-05-01.md
    status: complete
---

# GitHub Actions CI/CD Setup — Feature Discovery

## Story Context

PLATFORM-29 asks a platform engineer to build GitHub Actions CI/CD workflows from scratch for the app-insights-explorer web application — a two-container Docker app (Next.js frontend + NestJS API backend). The story picks up directly from PLATFORM-1, which provisioned all required Azure infrastructure manually. This story establishes the automation layer that uses that infrastructure.

The technical reading: create two workflow files (`pr.yml` and `ci.yml`) that together form a complete PR-gate + deploy pipeline targeting the `test` environment. The approach is step-by-step and pedagogical — each workflow step is atomic and self-explanatory, mirroring the style used in PLATFORM-1.

## Dialog Summary

- **One spec, two workflows.** PR validation (pr.yml) and CI deployment (ci.yml) are closely coupled — same images, same infrastructure, same repository — and are covered in a single spec.
- **Trigger branches.** PR to `development` triggers the build-only PR workflow. Merge to `development` triggers the full CI deployment workflow.
- **No Terraform.** This story deploys to the hand-provisioned test environment by pushing Docker images to ACR and deploying via the `azure/webapps-deploy` GitHub Action. Terraform comes in PLATFORM-3.
- **Deployment mechanism.** The `azure/webapps-deploy` GitHub Action was selected over raw Azure CLI — more structured, integrates with the GitHub Environment deployment history.
- **Image tagging.** Both `:latest` and the short git SHA are applied to every image push, linking each deployed image to an exact commit.
- **Smoke test.** A dedicated `GET /health` endpoint will be added to the NestJS API and excluded from the global `ApiKeyGuard`. This replaces the previous approach of treating HTTP 401 as "healthy," which was confusing in CI logs.
- **GitHub Environment.** The `test` environment is referenced by the deploy job for deployment history visibility. No approval gates — pushes to `development` deploy automatically.
- **Managed identity fix in scope.** Removing `excludeManagedIdentityCredential: true` from the NestJS `DefaultAzureCredential` is included in this story because it is a blocker for the deployed application being functional.
- **OIDC authentication.** The CI workflow authenticates to Azure using the OIDC federated credential provisioned in PLATFORM-1, scoped to the `development` branch. No Azure credentials are stored in GitHub.

## Key Design Decisions

### Build-only PR workflow, deploy-only CI workflow

The PR workflow builds both Docker images without pushing to ACR. This catches Dockerfile errors and build failures before code reaches `development`, without consuming ACR storage or triggering a deployment. The CI workflow handles all push and deploy steps and only runs after a merge is complete. This separation keeps the PR gate fast and cheap and makes the deployment path unambiguous.

### OIDC authentication over stored credentials

The CI workflow authenticates to Azure via the OIDC federated credential from PLATFORM-1 Task 12. GitHub generates a short-lived signed token at runtime; Azure exchanges it for an access token. No Azure credential is stored in GitHub's secret store. This is the current Azure/GitHub recommended pattern and eliminates credential rotation entirely.

### azure/webapps-deploy GitHub Action for deployment

After pushing images to ACR, the deploy step uses the official `azure/webapps-deploy` action rather than raw Azure CLI commands. This is more structured, more readable in CI logs, and integrates cleanly with the GitHub Environment deployment history UI.

### Image tagging: :latest + git SHA

Every image push tags with both `:latest` (for convenience) and the short git SHA (e.g., `:abc1234`). The SHA tag provides an immutable reference linking any deployed image to the exact commit that produced it — the most common traceability gap in Docker deployments.

### GET /health endpoint excluded from ApiKeyGuard

The smoke test requires an endpoint that responds HTTP 200 without authentication. The previous approach of treating HTTP 401 as "healthy" was confusing in CI logs and masked actual startup failures. A dedicated `GET /health` endpoint excluded from the global `ApiKeyGuard` provides a clear, unambiguous liveness signal.

### Managed identity fix included in scope

Removing `excludeManagedIdentityCredential: true` from the NestJS `DefaultAzureCredential` constructor is included in PLATFORM-29 because it is a hard blocker for the deployed application. Without this fix, the CI pipeline succeeds but the running application cannot query Application Insights. The fix is a one-line change that belongs in the same delivery as the deployment pipeline.

## Delivery Assessment

```
Readiness: Code-ready
Blocking Items:
- None — PLATFORM-1 infrastructure is complete; OIDC federated credential,
  ACR, and App Service configuration are all in place
Decomposition:
- None identified — both workflows share the same images and infrastructure;
  splitting would create artificial handoffs
```

## Spec Manifest

1. **`github-actions-setup-spec-2026-05-01.md`** — Full CI/CD workflow spec. Covers both the PR validation and CI deployment workflows, the health endpoint addition, the managed identity fix, and all design decisions.

[[github-actions-setup-spec-2026-05-01]]

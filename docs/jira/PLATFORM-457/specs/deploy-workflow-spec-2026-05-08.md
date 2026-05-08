---
title: "GitHub Actions Reusable Deploy Workflow — Feature Spec"
ticket: PLATFORM-457
slug: deploy-workflow
discovery: specs/deploy-workflow-discovery.md
date: 2026-05-08
tags: [ai/generated, jira/feature-spec]
status: final
stale: false
---

# GitHub Actions Reusable Deploy Workflow — Feature Spec

## 1. Overview

This feature refactors the existing monolithic `ci-test.yml` into a general-purpose `ci.yml`
that builds and pushes Docker images on every push to `development`, and introduces a reusable
`_deploy.yml` workflow that handles all environment-specific deployment steps. The central
concern is separating the build (universal CI) from the deploy (environment-specific) so that
the same deploy logic can be invoked for any environment without duplication. `_deploy.yml` is
triggered by `workflow_call` and handles Azure OIDC authentication, App Service image
deployment, Key Vault secret population, and the stop/start cycle required to force Key Vault
reference refresh. Environment variable isolation is achieved via GitHub's environment scoping
— the reusable workflow job declares `environment: {input}` and GitHub automatically resolves
all environment-scoped Variables and Secrets to the named environment.

The release pipeline establishes the build-once / promote-by-SHA model. Docker images are
built and tagged with the git short SHA when code lands on `development`. When a developer
cuts a `release/x.x.x` branch, that branch push triggers `ci-release.yml`, which derives the
SHA from the release branch HEAD, references the already-pushed ACR tag, and calls `_deploy.yml`
for staging followed by production. The production job is gated by a GitHub environment
protection rule requiring one reviewer — no image rebuild occurs at any point in the release
pipeline.

## 2. Delivery Assessment

```
Readiness: Partially blocked

Blocking Items:
- Frontend NEXT_PUBLIC_API_URL is currently a Docker build-arg baked into the Next.js
  bundle at compile time. Promoting the test image to staging embeds the test API URL in
  the frontend. This build-arg must be moved to a runtime-injectable source before the
  frontend image can participate in the build-once promotion model.
- NEXT_PUBLIC_BACKEND_API_SECRET is also a build-arg, embedding a secret in the client-side
  bundle. This is a security concern that must be resolved alongside the URL fix.
- OIDC federated credentials for the CI/CD service principal must cover the staging and
  production GitHub environments. The current credential only covers the test environment.
  A new credential subject claim is required for each additional environment.
- Staging and production GitHub environments must be created in repository settings with
  environment-scoped Variables (WEBAPP_FRONTEND, WEBAPP_API, KV_NAME, ACR_LOGIN_SERVER,
  AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID) before ci-release.yml can
  succeed.

Decomposition:
- None identified — all concerns are tightly coupled and belong in this ticket.
```

## 3. Technical Context

The current CI pipeline has three workflow files. `ci-test.yml` fires on push to
`development` when application files change; it builds and pushes Docker images tagged with
both `latest` and the git short SHA, then deploys to the test environment using the SHA tag.
The deploy job populates Key Vault secrets from GitHub Secrets and stops/starts the App
Services to force Key Vault reference resolution. `pr.yml` fires on PRs to `development` and
builds images without pushing, providing a Dockerfile validity check. `terraform.yml` handles
`infra/` changes separately — plan on PR, apply on push to `development`.

The test environment uses GitHub's environment scoping: all Azure credentials and App Service
identifiers (`WEBAPP_FRONTEND`, `WEBAPP_API`, `KV_NAME`, `ACR_LOGIN_SERVER`) are stored as
environment-scoped GitHub Variables under the `test` environment. This scoping model is the
mechanism that makes a generic reusable workflow possible — the same workflow logic resolves
different values for each environment automatically.

The Terraform module introduced in PLATFORM-456 created the staging and production Azure
resource roots (`infra/envs/staging/`, `infra/envs/production/`) but has not applied them.
Staging and production Azure resources do not yet exist.

The current `ci-test.yml` frontend build passes `NEXT_PUBLIC_API_URL` and
`NEXT_PUBLIC_BACKEND_API_SECRET` as Docker build-args. Next.js embeds `NEXT_PUBLIC_*`
variables into the static JavaScript bundle at compile time — they cannot be overridden at
container runtime. This is the primary structural barrier to promoting the frontend image.

## 4. Technical Scope

- `.github/workflows/_deploy.yml` — new reusable workflow file
- `.github/workflows/ci-test.yml` — renamed to `ci.yml` and refactored: build job unchanged,
  deploy job replaced with a `workflow_call` invocation of `_deploy.yml`
- `.github/workflows/ci-release.yml` — new workflow file, triggered on push to `release/*`
- GitHub repository environment settings: staging and production environments with
  environment-scoped Variables and protection rules (one-time manual configuration, not
  automated by this workflow)
- Frontend Next.js application code: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_BACKEND_API_SECRET`
  must be decoupled from Docker build-args (blocking dependency — implementation approach
  is outside this spec's scope)
- `infra/shared/` Terraform: OIDC federated credential subjects for staging and production
  GitHub environments (may be a Terraform change or a manual Azure portal step)

## 5. Key Design Decisions

### Build-Once / Promote-by-SHA
Images are built exactly once on push to `development`, tagged with the git short SHA. The
release pipeline derives the SHA from `git rev-parse --short HEAD` on the release branch
and references the pre-existing ACR tag — no Docker build, no Buildx, no Dockerfile in the
release pipeline.

Rejected alternative — rebuild on release branch: base image tags (e.g., `node:20-alpine`,
`mcr.microsoft.com/dotnet/aspnet:8.0`) move over time; transitive dependencies resolved
during `npm install` or NuGet restore may differ across runs; build-time variables and runner
environments vary. A rebuild from the same commit SHA is not guaranteed to produce the same
image bytes. The image tested in `development` must be the exact artifact deployed to
production.

### GitHub Environment Scoping for Variable Isolation
The reusable workflow's deploy job declares `environment: ${{ inputs.environment }}`. GitHub
resolves all environment-scoped Variables and Secrets to that environment automatically. No
per-variable inputs are required on the `workflow_call` interface. Adding a new environment
requires only creating the GitHub environment with the appropriate variables — no workflow
file changes.

### `secrets: inherit` for Secret Propagation
The reusable workflow uses `secrets: inherit` rather than enumerating explicit secrets as
`workflow_call` secret inputs. This decouples the caller and callee on the secret manifest —
new secrets can be added to GitHub environments without updating the reusable workflow's
interface.

### Resource Group Derived from Environment Name
The deploy job constructs the resource group name inline as
`rg-app-insights-explorer-{environment}-tfg`, matching the naming convention established in
the Terraform module (PLATFORM-456). This avoids an extra input and ensures consistency with
the IaC naming convention.

### Production Approval via GitHub Environment Protection Rules
The `production` GitHub environment is configured with one required reviewer. The production
job in `ci-release.yml` uses `environment: production`, which causes GitHub to pause the job
and display an approval prompt before execution. No custom approval workflow, webhook, or
external tooling is required. This is the simplified POC model — the full model calls for
three approvals (QA, PM, DevOps).

### Workflow File Naming Convention
Reusable workflows are prefixed with `_` (underscore) to distinguish them from
event-triggered caller workflows. This is a GitHub Actions convention that prevents
accidental direct triggers and signals intent clearly to readers of the workflow directory.

## 6. Technical Dependencies

- **PLATFORM-456 merged and test environment state migration complete**: The Terraform module
  extraction must be merged before this workflow refactor, as `ci-test.yml` will continue
  deploying to the test environment whose IaC now lives in `infra/envs/test/`.
- **Frontend build-arg fix**: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_BACKEND_API_SECRET` must
  be removed from Docker build-args and sourced at runtime before the frontend image can be
  promoted. Until this fix lands, the frontend is excluded from the build-once promotion
  model — staging/production frontend deployments would require a separate per-environment
  build or the fix as a prerequisite.
- **OIDC federated credential expansion**: The CI/CD service principal's OIDC federated
  credential must include subject claims for the `staging` and `production` GitHub
  environments. Currently only `environment:test` is likely covered. New subject claims of
  the form `repo:{owner}/{repo}:environment:staging` and
  `repo:{owner}/{repo}:environment:production` must be added.
- **Staging and production GitHub environments**: Both environments must be created in
  repository settings with environment-scoped Variables set to the values output by
  `terraform apply` for `infra/envs/staging/` and `infra/envs/production/` respectively.
  The production environment must have a required reviewer configured.
- **Staging and production Azure resources**: `terraform apply` must be run for both env
  roots before `ci-release.yml` can successfully deploy. This is a sequencing dependency —
  the workflow can be merged before apply, but it cannot succeed until apply has run.

## 7. Technical Concerns & Risks

**Frontend build-time variable baking**: `NEXT_PUBLIC_API_URL` is embedded in the JavaScript
bundle at image build time. Promoting the development-built image to staging means the
frontend served from staging will call the test API. This is a functional correctness
failure, not just a configuration drift. The spec treats this as a hard blocker for frontend
promotion; the API image (which has no `NEXT_PUBLIC_*` build-args) can be promoted safely.

**`NEXT_PUBLIC_BACKEND_API_SECRET` in the client bundle**: This value is currently passed as
a build-arg and ends up in the compiled Next.js bundle, making it readable in the
client-side JavaScript delivered to browsers. This is a security concern independent of the
build-once refactor. It should be resolved alongside the API URL fix.

**OIDC credential scope gap**: GitHub OIDC tokens for environment-scoped jobs include an
`environment` claim. If the CI/CD service principal's federated credentials only cover the
`test` subject, the Azure login step in `_deploy.yml` will return a 401 when called for
staging or production, with a potentially confusing error message. This must be resolved
before the first staging deployment attempt.

## 8. Non-Scope

- Running `terraform apply` for staging or production environments — the workflow can merge
  and be tested structurally; actual deployment to staging/production depends on apply
  completing, which is sequenced separately.
- Changes to `terraform.yml` — the Terraform workflow covers only the test environment and
  is unchanged by this story.
- Changes to `pr.yml` — PR validation builds without pushing and requires no changes.
- Full three-approval production gate (QA, PM, DevOps) — the full model is documented as the
  production-readiness target; this spec implements the single-reviewer POC simplification.
- Smoke test URL construction for staging/production — the reusable workflow derives App
  Service hostnames from the `WEBAPP_API` and `WEBAPP_FRONTEND` environment variables,
  which are environment-scoped; no spec decision is required.
- Frontend runtime refactor implementation — the need is identified as a blocking dependency;
  the approach for making `NEXT_PUBLIC_API_URL` runtime-injectable is out of scope here.
- Hotfix process — `development` acts as the integration branch and is always ahead of any
  release branch; hotfixes would need to be applied directly to the release branch, which
  would produce a SHA not built during the development push. Defining a hotfix workflow
  (e.g., ACR tag existence check with fallback build, or cherry-pick through development
  first) is deferred for this experiment.

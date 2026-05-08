---
title: "GitHub Actions Reusable Deploy Workflow — Feature Discovery"
ticket: PLATFORM-457
slug: deploy-workflow
date: 2026-05-08
tags: [ai/generated, jira/discovery]
status: specs_complete
specs:
  - slug: deploy-workflow
    file: specs/deploy-workflow-spec-2026-05-08.md
    status: complete
---

# GitHub Actions Reusable Deploy Workflow — Feature Discovery

## Story Context

PLATFORM-457 asks for two related changes: extract the deploy logic from `ci-test.yml` into a
reusable `_deploy.yml` workflow callable by any environment, and add a release pipeline that
promotes the image built during the development push through staging and production without
rebuilding. The technical intent is a build-once / promote-by-SHA model where a single Docker
image, built and tagged when code lands on `development`, is the artifact that flows through
all environments.

## Dialog Summary

- **Triggers**: push to `development` continues to trigger the test build-and-deploy. A new
  `release/x.x.x` branch push triggers staging deployment, followed by production with a
  single approval gate.
- **Build-once confirmed**: The industry-standard "build once, deploy many" argument was
  accepted. Rebuilding from the same SHA is unsafe because base image tags move, transitive
  dependencies can resolve differently, and build-time variables differ — undermining the
  guarantee that what was tested is what gets deployed. The release pipeline will derive the
  git short SHA from the release branch HEAD, then reference the ACR tag built during the
  development push.
- **Frontend build-arg blocker surfaced**: `NEXT_PUBLIC_API_URL` and
  `NEXT_PUBLIC_BACKEND_API_SECRET` are currently passed as Docker build-args and baked into
  the Next.js bundle at compile time. Promoting the test image to staging/production would
  embed the test API URL in the frontend. This must be resolved before strict build-once
  applies to the frontend image.
- **GitHub environment scoping handles variable isolation**: Using `environment: ${{ inputs.environment }}`
  in the reusable workflow job automatically scopes all GitHub Variables and Secrets to the
  named environment. No per-variable inputs needed.
- **Production approval via GitHub environment protection rules**: One required reviewer on the
  `production` GitHub environment is sufficient for the POC. No custom approval workflow.

## Key Design Decisions

### Build-once / Promote-by-SHA
Images are built exactly once on push to `development`, tagged with the git short SHA. The
release pipeline references the existing ACR tag by SHA — no Dockerfile, no Docker Buildx,
no rebuild. Rejected alternative: rebuild on release branch push. Rejected because base image
tag drift, transitive dependency resolution differences, and build-time variable variation all
mean a "same SHA" rebuild is not guaranteed to produce the same image bytes.

### GitHub Environment Scoping for Variable Isolation
The reusable workflow job uses `environment: ${{ inputs.environment }}`. GitHub resolves all
environment-scoped Variables and Secrets within that job context automatically. This means
`WEBAPP_FRONTEND`, `WEBAPP_API`, `KV_NAME`, `ACR_LOGIN_SERVER`, and OIDC credentials are
namespaced per environment without any per-variable workflow inputs.

### `secrets: inherit` for Secret Propagation
The reusable workflow uses `secrets: inherit` rather than enumerating explicit `secrets:`
inputs. This keeps the interface clean and avoids tight coupling between caller and callee
on the secret manifest.

### Resource Group Derived from Environment Name
The deploy job derives the resource group as `rg-app-insights-explorer-{env}-tfg` inline,
matching the naming convention from the Terraform module (PLATFORM-456). No extra input needed.

### Production Approval via GitHub Environment Protection Rules
The `production` GitHub environment is configured with one required reviewer. The
`ci-release.yml` production job uses `environment: production`, which causes GitHub to pause
and await human approval before the job runs. No external tooling or custom workflow required.

### `secrets: inherit` + Environment Scoping is Sufficient
Caller workflows do not need to pass environment-specific secrets explicitly because GitHub's
environment job context resolves them. The caller passes only `environment` and `sha` as inputs.

### Frontend Build-Arg Fix is a Hard Dependency
`NEXT_PUBLIC_API_URL` must be moved to a runtime-injectable source before the frontend image
can participate in the build-once promotion model. Until that fix lands, the frontend image
cannot be promoted — it embeds the test API URL at build time.

## Delivery Assessment

Readiness: Partially blocked

Blocking items:
- Frontend `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_BACKEND_API_SECRET` are baked as Docker
  build-args. Must be made runtime-injectable before frontend image promotion is sound.
- OIDC federated credentials for the CI/CD service principal must cover the `staging` and
  `production` GitHub environments. Currently only `test` is covered. Requires a change to
  `infra/shared/` Terraform or a manual credential addition.
- Staging and production GitHub environments must be created in repo settings with
  environment-scoped Variables and protection rules before `ci-release.yml` can succeed.

Decomposition: None — all three concerns belong together in this ticket.

## Spec Manifest

One spec covers the full workflow restructuring:
- **deploy-workflow**: `_deploy.yml` reusable workflow, `ci-test.yml` renamed to `ci.yml`
  and refactored, `ci-release.yml` release pipeline, GitHub environment configuration.

[[deploy-workflow-spec-2026-05-08.md]]

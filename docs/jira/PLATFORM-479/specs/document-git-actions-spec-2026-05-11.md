---
title: "Document Git Actions — Feature Spec"
ticket: PLATFORM-479
slug: document-git-actions
discovery: specs/document-git-actions-discovery.md
date: 2026-05-11
tags: [ai/generated, jira/feature-spec]
status: final
stale: false
---

# Document Git Actions — Feature Spec

## 1. Overview

This feature produces a single markdown reference document — `docs/jira/PLATFORM-479/github-actions.md` — that describes the purpose, triggers, and behavioral notes for each of the 5 GitHub Actions workflows in this repository. The source Jira story is PLATFORM-479, a sub-task of PLATFORM-453 (Refactor IaC and CI/CD Pipeline for Environment Promotion).

The 5 workflows collectively form the CI/CD pipeline: a PR validation gate, a build-and-deploy path on merge, a reusable deployment unit, a Terraform IaC management workflow, and a release promotion workflow. The documentation is written for developers who need to understand or modify the pipeline, translating the workflow files' intent into plain language without duplicating their YAML content.

## 2. Delivery Assessment

```
Readiness: Code-ready
Blocking Items:
- None
Decomposition:
- None identified
```

## 3. Technical Context

The repository contains 5 workflow files under `.github/workflows/`:

- **`pr.yml`** — triggered on pull requests to `development` when `frontend/**` or `backend/**` paths change. Builds Docker images for both services without pushing. Exists as a build validity gate: it catches broken Dockerfiles before a branch merges.

- **`ci.yml`** — triggered on push to `development`. Logs in to Azure via OIDC, builds and pushes both Docker images to ACR (tagged `:latest` and `:{short_sha}`), then calls `_deploy.yml` to deploy the `:{short_sha}` image to the TEST environment. This is the primary continuous delivery path.

- **`_deploy.yml`** — a reusable workflow (`workflow_call` only; never triggered directly). Takes `environment` and `sha` as inputs. Deploys frontend and API containers to Azure App Service from ACR, populates Key Vault secrets, bounces the App Services (stop/start), waits 60 seconds, then smoke-tests both endpoints. Called by `ci.yml` (for TEST) and `ci-release.yml` (for STAGING and PRODUCTION).

- **`terraform.yml`** — three trigger surfaces: (1) PR to `development` with `infra/**` path changes — runs `terraform plan` across all three environments (test/staging/production) and posts results as a PR comment; (2) push to `development` with `infra/**` path changes — runs `terraform apply` on TEST only; (3) `workflow_dispatch` — manual plan or apply targeting a specific environment (test/staging/production/shared). A `concurrency: terraform` group prevents concurrent Terraform runs. This workflow owns all IaC changes.

- **`ci-release.yml`** — triggered on push to any `release/**` branch. Reads the branch tip SHA and calls `_deploy.yml` sequentially: first STAGING, then PRODUCTION (gated on STAGING success). Does not rebuild images — it promotes the SHA that was already built and deployed to TEST by `ci.yml`.

The reusable `_deploy.yml` pattern was introduced to eliminate duplication between the TEST deploy path in `ci.yml` and the STAGING/PRODUCTION path in `ci-release.yml`.

## 4. Technical Scope

The single output is a new markdown file at `docs/jira/PLATFORM-479/github-actions.md`. It covers all 5 workflows in one document. No existing files are modified. No new directories are created beyond what the dossier already provides.

## 5. Key Design Decisions

### Single file for all 5 workflows

One document covering all 5 workflows is easier to discover and navigate than 5 separate files. The workflows are tightly related — they form a single pipeline — and the per-workflow content is brief enough that one file stays readable. Per-workflow files would fragment context that readers typically need together.

### Output lives in the dossier directory

The file is placed at `docs/jira/PLATFORM-479/github-actions.md` rather than a top-level `docs/` directory. This is consistent with how all other artifacts in this project are stored — within the relevant ticket's dossier — and avoids introducing a new top-level docs convention as a side effect of this task.

### No modifications to `.yml` workflow files

The workflow YAML files are not changed. All documentation is captured in the markdown output file. This keeps the change surface minimal and avoids mixing documentation concerns into the workflow source.

## 6. Technical Dependencies

- All 5 workflow files must exist in `.github/workflows/` — they do.
- No infrastructure, service, or build dependency is required to produce a documentation file.

## 7. Technical Concerns & Risks

**Staleness** — the markdown doc will drift from reality as workflows evolve. There is no automated mechanism to detect this. Mitigation: the doc is versioned in git alongside the workflow files; diff review during PR catches divergence. This risk is accepted as inherent to any static documentation.

**Coverage gaps from missing screenshots** — the original Jira ticket referenced two inline screenshots that are not accessible as text. Reading the actual `.yml` files directly resolves this; all 5 workflows were read in full during spec authorship, so no coverage gap remains.

## 8. Non-Scope

- No changes to the `.github/workflows/*.yml` files.
- No Confluence page — documentation lives in the repo only.
- No operational how-to content (e.g., "how to trigger a manual Terraform apply") — only what each workflow is, why it exists, and what triggers it.
- No documentation of the `infra/` Terraform module structure — that is covered by separate tickets (PLATFORM-456, PLATFORM-453).
- No automated staleness detection or doc-generation tooling.

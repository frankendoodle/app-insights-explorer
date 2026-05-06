---
title: "Terraform Workflow Automation — Feature Discovery"
ticket: PLATFORM-423
slug: terraform-workflow-automation
date: 2026-05-06
tags: [ai/generated, jira/discovery]
status: specs_complete
specs:
  - slug: terraform-workflow-automation
    file: specs/terraform-workflow-automation-spec-2026-05-06.md
    status: complete
---

# Terraform Workflow Automation — Feature Discovery

## Story Context

PLATFORM-423 asks for GitHub Actions workflows that run `terraform plan` on PRs and `terraform apply` on pushes to `development`, scoped to changes under `infra/`. The technical intent is to replace the current manual provisioning process — where a developer runs `terraform apply` locally — with a code-driven GitOps loop. Infrastructure changes become reviewable, auditable, and automated in the same way app changes are.

## Dialog Summary

- A dedicated `terraform.yml` workflow file is preferred over extending `pr.yml`/`ci-test.yml` — keeps infrastructure automation cleanly separated from app deployment.
- Both jobs are path-filtered to `infra/**` — no runs triggered by app-only commits.
- Cross-module input variables (`acr_id`, `sso_client_id`, `cicd_sp_object_id`) will be stored as GitHub Variables rather than captured dynamically from `terraform output`. This avoids fragile inter-step output passing and is safe given none of these values are credentials.
- `sso_client_id` gets its own Variable (`SSO_CLIENT_ID`) rather than reusing `secrets.AZURE_AD_CLIENT_ID` — keeps Terraform input wiring explicit and decoupled from app config.
- `pull-requests: write` permission is required for the plan job to post output as a PR comment.
- A significant gap was identified: the existing OIDC federated credential is scoped to `refs/heads/development` only. PR workflows use a different OIDC subject (`pull_request`). A second federated credential must be added before the plan job can authenticate to Azure. This is a prerequisite for this story.

## Key Design Decisions

### Dedicated workflow file

A new `terraform.yml` workflow file is created rather than adding jobs to `pr.yml` or `ci-test.yml`. Infrastructure automation and app deployment have different triggers, permissions, and failure semantics. Keeping them in separate files makes each easier to reason about and modify independently.

Rejected: adding Terraform jobs to existing workflows — would conflate infrastructure and application concerns in a single file.

### Path-filtered triggers

Both the plan and apply jobs use `paths: ['infra/**']` filters. This prevents the Terraform workflow from running on app-only commits, which have no infra changes to plan or apply.

Rejected: triggering on all PRs and pushes — wastes CI time and generates noise on every app commit.

### GitHub Variables for cross-module inputs

`infra/envs/test/` requires `acr_login_server`, `acr_id`, `sso_client_id`, and `cicd_sp_object_id` as Terraform input variables. These are stored as GitHub Variables (`ACR_LOGIN_SERVER` already exists; `ACR_ID`, `SSO_CLIENT_ID`, and `CICD_SP_OBJECT_ID` are added). The workflow reads them directly rather than capturing `terraform output` values from a prior apply step.

Rejected: dynamic `terraform output` capture — adds brittle inter-step output passing and risks the apply job failing to forward values correctly if output format changes.

### SSO_CLIENT_ID as a dedicated Variable

`sso_client_id` is stored as a new GitHub Variable `SSO_CLIENT_ID` rather than referencing the existing `AZURE_AD_CLIENT_ID` secret. These serve different purposes: `AZURE_AD_CLIENT_ID` is the app's runtime secret; `SSO_CLIENT_ID` is the Terraform IaC input. Keeping them separate prevents a naming collision and makes the Terraform wiring explicit.

### pull-requests: write permission

The `terraform.yml` workflow declares `pull-requests: write` alongside `id-token: write` and `contents: read`. This is required for the plan job to post a comment on the PR. The existing `pr.yml` does not have this permission and should not be modified for this purpose.

## Delivery Assessment

```
Readiness: Partially blocked
Blocking Items:
- A second OIDC federated credential scoped to pull_request events must be added
  before the plan job can authenticate to Azure. The existing credential covers
  refs/heads/development only. This can be added via Terraform (new resource in
  infra/shared/) or manually in the Azure portal.
Decomposition:
- None identified — the plan job and apply job are a single cohesive deliverable.
  The OIDC credential addition is a prerequisite step, not a separate concern.
```

## Spec Manifest

- **terraform-workflow-automation** — the full `terraform.yml` workflow: plan-on-PR and apply-on-push, including the OIDC credential prerequisite, GitHub Variable additions, and PR comment posting.

[[terraform-workflow-automation-spec-2026-05-06]]

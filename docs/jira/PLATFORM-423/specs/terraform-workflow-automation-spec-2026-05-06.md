---
title: "Terraform Workflow Automation — Feature Spec"
ticket: PLATFORM-423
slug: terraform-workflow-automation
discovery: specs/terraform-workflow-automation-discovery.md
date: 2026-05-06
tags: [ai/generated, jira/feature-spec]
status: final
stale: false
---

# Terraform Workflow Automation — Feature Spec

## 1. Overview

PLATFORM-423 replaces the manual `terraform apply` provisioning process for `app-insights-explorer` with a dedicated GitHub Actions workflow that automates infrastructure changes through the existing GitOps pipeline. The workflow introduces two behaviors: a plan job that runs `terraform plan` on pull requests and posts the output as a PR comment, and an apply job that runs `terraform apply` on pushes to `development`. Both behaviors are scoped to changes under `infra/` and follow the OIDC authentication pattern already established in `ci-test.yml`.

The two Terraform modules — `infra/shared/` and `infra/envs/test/` — are applied in sequence within the same job. Output values that `infra/envs/test/` requires from `infra/shared/` are sourced from GitHub Variables set once at repo configuration time, rather than captured dynamically between steps. A prerequisite to this story is adding a second OIDC federated credential to cover pull_request workflow contexts, since the existing credential only covers `refs/heads/development`.

## 2. Delivery Assessment

```
Readiness: Partially blocked
Blocking Items:
- A second OIDC federated credential scoped to pull_request events must exist
  before the plan job can authenticate to Azure. The existing credential from
  PLATFORM-3 covers refs/heads/development only. This credential must be added
  to infra/shared/ as a new azuread_application_federated_identity_credential
  resource (or added manually) before this workflow can run successfully on PRs.
- Three new GitHub Variables must be set before the first workflow run:
  ACR_ID, SSO_CLIENT_ID, CICD_SP_OBJECT_ID.
Decomposition:
- None identified — plan and apply are a single cohesive deliverable.
```

## 3. Technical Context

PLATFORM-1 manually provisioned all Azure infrastructure for `app-insights-explorer`. PLATFORM-3 replaced that manual process with Terraform IaC, producing two root modules: `infra/shared/` (ACR, OIDC credentials, SSO App Registration) and `infra/envs/test/` (resource group, App Service Plan, web apps, Key Vault, RBAC). Both modules have been applied manually and their state is stored in an Azure Blob Storage backend.

PLATFORM-29 established two GitHub Actions workflows: `pr.yml` (build-only on PR) and `ci-test.yml` (build, push, deploy on merge to `development`). These workflows use OIDC for passwordless Azure authentication, scoped to the `development` branch via a federated identity credential on the CI/CD service principal. Neither workflow touches Terraform.

Today, any infrastructure change requires a developer to run `terraform init` and `terraform apply` locally, manually passing input variables. This story automates that process without modifying the existing app deployment workflows.

## 4. Technical Scope

- **New GitHub Actions workflow file** — `terraform.yml`, with two jobs: plan (PR trigger) and apply (push trigger), both path-filtered to `infra/**`
- **GitHub Actions permissions** — `id-token: write`, `contents: read`, `pull-requests: write`
- **Azure OIDC authentication** — same pattern as `ci-test.yml`; requires a second federated credential for `pull_request` workflow context
- **Terraform CLI** — initialized via `hashicorp/setup-terraform` action; partial backend configuration supplied from existing GitHub Variables
- **`infra/shared/` module** — plan and apply steps run first in both jobs
- **`infra/envs/test/` module** — plan and apply steps run second, after `infra/shared/` completes; input variables sourced from GitHub Variables
- **PR comment posting** — plan output posted to the triggering PR; when output exceeds the GitHub comment size limit, the full plan is uploaded as a workflow artifact and the comment contains a link to the Actions run instead
- **GitHub Variables** — three new variables added to the repository: `ACR_ID`, `SSO_CLIENT_ID`, `CICD_SP_OBJECT_ID`
- **`infra/shared/` Terraform resource** — new `azuread_application_federated_identity_credential` resource for the `pull_request` OIDC subject

## 5. Key Design Decisions

### Dedicated workflow file

`terraform.yml` is a new file separate from `pr.yml` and `ci-test.yml`. Infrastructure automation and app deployment have different triggers, permissions, and failure modes. A dedicated file makes each concern independently maintainable and avoids introducing infrastructure failures into the app deployment signal.

Rejected: extending existing workflow files — conflates concerns and makes both harder to reason about.

### Path-filtered triggers

Both jobs use `paths: ['infra/**']` filters on their respective triggers. This prevents the Terraform workflow from running on commits that contain only application code changes, eliminating unnecessary plan and apply runs.

Rejected: triggering on all PRs and pushes — wastes CI minutes and generates noise on every app commit.

### GitHub Variables for cross-module inputs

`infra/envs/test/` requires four input variables: `acr_login_server`, `acr_id`, `sso_client_id`, and `cicd_sp_object_id`. These are provided from GitHub Variables (`ACR_LOGIN_SERVER` already exists; `ACR_ID`, `SSO_CLIENT_ID`, and `CICD_SP_OBJECT_ID` are added as part of this story). None of these values are credentials — they are Azure resource identifiers and GUIDs — so storing them as Variables (not Secrets) is appropriate.

Rejected: capturing `terraform output` values dynamically between steps — fragile, adds inter-step output passing complexity, and risks silent failures if output names change.

### SSO_CLIENT_ID as a dedicated Variable

`sso_client_id` is stored as a new GitHub Variable `SSO_CLIENT_ID` rather than referencing the existing `AZURE_AD_CLIENT_ID` secret. These values are equal in content but serve different purposes: `AZURE_AD_CLIENT_ID` is the application's runtime secret wired into Key Vault; `SSO_CLIENT_ID` is the Terraform IaC input. Keeping them separate prevents naming ambiguity and makes the Terraform variable wiring self-documenting.

### Second OIDC federated credential for pull_request context

GitHub Actions PR workflows present an OIDC subject of the form `repo:{owner}/{repo}:pull_request`. The existing federated credential from PLATFORM-3 is scoped to `repo:{owner}/{repo}:ref:refs/heads/development` and does not cover this subject. A second `azuread_application_federated_identity_credential` resource must be added to `infra/shared/oidc.tf` with the exact subject `repo:frankendoodle/app-insights-explorer:pull_request`. This credential must be applied manually once before the plan job can run — it cannot be added via the automated workflow because the workflow depends on the credential to authenticate. After that one-time manual apply, all future changes proceed through the automated workflow.

### Both modules apply unconditionally on every infra trigger

When the workflow triggers on any `infra/**` change, it applies `infra/shared/` followed by `infra/envs/test/` in full — regardless of which module was actually modified. A change scoped only to `infra/envs/test/` still runs `terraform apply` on `infra/shared/`. This is an accepted trade-off for simplicity: the modules are tightly coupled, `infra/shared/` is intentionally stable, and unconditional sequencing avoids the complexity of per-module path conditions within the apply job.

Rejected: per-module path filtering within the apply job steps — adds workflow complexity without meaningful safety benefit for a single-environment, single-developer setup.

## 6. Technical Dependencies

- **PLATFORM-3 Terraform modules** — `infra/shared/` and `infra/envs/test/` must exist, be valid, and have initialized state in the Azure Blob Storage backend
- **Existing GitHub Variables** — `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `TF_BACKEND_RESOURCE_GROUP`, `TF_BACKEND_STORAGE_ACCOUNT`, `ACR_LOGIN_SERVER` must be set (all established during PLATFORM-3)
- **New GitHub Variables** — `ACR_ID`, `SSO_CLIENT_ID`, `CICD_SP_OBJECT_ID` must be added before the first workflow run; values are available from PLATFORM-3 bootstrap output and `terraform output` on `infra/shared/`
- **OIDC federated credential for pull_request** — must be added to `infra/shared/oidc.tf` with subject `repo:frankendoodle/app-insights-explorer:pull_request` and applied manually once before the plan job is exercised on a PR; this is a one-time bootstrap step that cannot be performed by the automated workflow itself
- **`hashicorp/setup-terraform` GitHub Action** — must be available; no pinned version conflicts with existing workflows
- **GitHub repository** — `pull-requests: write` permission must not be restricted at the organization level

## 7. Technical Concerns & Risks

**State lock contention on concurrent runs.** If two developers push infra changes to `development` in quick succession, the apply job for the second commit may attempt to acquire the Terraform state lock while the first job holds it. Azure Blob Storage state locking will cause the second run to fail with a lock error rather than corrupt state. This is safe but will require a manual re-run. The risk is low for a single-developer repo but worth noting.

**OIDC subject mismatch on the plan job.** Until the second federated credential is added and applied, every PR that touches `infra/` will fail at the Azure login step. This is the primary delivery blocker. The fix is a one-resource Terraform change in `infra/shared/oidc.tf` followed by `terraform apply infra/shared/`.

**Plan output size.** GitHub PR comments have a hard limit of 65,536 characters. When plan output exceeds this, the workflow uploads the full plan as a workflow artifact and posts a short comment containing only a link to the Actions run. This ensures the full plan is always available without silently truncating or failing the comment step.

**`CICD_SP_OBJECT_ID` stored as a GitHub Variable.** This value is used to bind a Key Vault Secrets Officer role assignment. It is stored as a Variable rather than a Secret — an explicit decision. The object ID is a public identifier and not a credential; knowing it grants no access. Azure RBAC enforcement is the actual security boundary here.

**Stale GitHub Variables.** If the ACR, SSO App Registration, or CI/CD service principal is re-created (e.g., after a `terraform destroy` and re-apply), the stored values for `ACR_ID`, `SSO_CLIENT_ID`, and `CICD_SP_OBJECT_ID` will become stale and the apply job will fail. These variables must be updated manually whenever the corresponding Terraform-managed resources are replaced.

## 8. Non-Scope

- Scheduled drift detection — running `terraform plan` on a cron schedule to detect out-of-band infrastructure changes is not part of this story.
- Manual approval gates — no environment protection rules or required reviewers before `terraform apply` runs; auto-apply on push to `development` is the intended behavior for this single-environment, personal-account setup.
- Staging or production Terraform environments — this workflow covers the `test` environment only, consistent with the current infrastructure scope.
- `terraform destroy` workflow — no automated destroy job is introduced.
- Notifications on apply failure — Slack or Teams alerting on failed applies is out of scope.

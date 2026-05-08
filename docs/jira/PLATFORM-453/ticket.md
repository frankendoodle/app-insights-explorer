---
ticket: PLATFORM-453
fetched: 2026-05-08T00:00:00-07:00
jira_updated: 2026-05-07T16:34:12.822-0700
---

# PLATFORM-453 — Refactor IaC and CI/CD Pipeline for Environment Promotion

| Field | Value |
|---|---|
| **Summary** | Refactor IaC and CI/CD Pipeline for Environment Promotion |
| **Status** | Created (To Do) |
| **Priority** | Medium |
| **Type** | Story |
| **Assignee** | Unassigned |
| **Reporter** | Goulart, Frank |
| **Created** | 2026-05-07T16:34:05-07:00 |
| **Updated** | 2026-05-07T16:34:12-07:00 |
| **Sprint** | PLATFORM Sprint 3 |
| **Labels** | _(none)_ |
| **Components** | _(none)_ |
| **Epic** | _(none)_ |

---

## Description

As a platform engineer, I want the Terraform IaC and GitHub Actions pipeline refactored to support environment promotion so that the same artifact is built once and promoted through test, staging, and production without duplicating infrastructure code or pipeline logic.

### Background

The current IaC structure has a single envs/test/ directory containing all resource definitions. The natural next step of adding staging and production by copying that folder would result in three copies of the same logic — creating maintenance overhead and drift risk. This story captures the refactor to a module-based structure with a proper artifact promotion model.

### Terraform: Modules + Thin Environment Roots

Extract all resource definitions (App Service plan, web apps, Key Vault, RBAC) into modules/app-environment/. Each environment root becomes ~20 lines of variable assignments calling that module. Shared infrastructure (ACR, SSO App Reg, OIDC) in infra/shared/ remains unchanged.

Proposed structure:

```text
infra/
├── modules/app-environment/   ← all real resources live here
│   ├── main.tf
│   ├── webapps.tf
│   ├── keyvault.tf
│   ├── rbac.tf
│   └── variables.tf
└── envs/
    ├── test/main.tf           ← calls module, sets test vars
    ├── staging/main.tf        ← calls module, sets staging vars
    └── production/main.tf     ← calls module, sets production vars
```

### GitHub Actions: Reusable Workflows

Extract the deploy steps into a reusable _deploy.yml (triggered by workflow_call, accepts environment name as input). Environment-specific workflows become thin callers. Promotion gates (manual approval, environment protection rules) are configured at the GitHub environment level, not in the workflow YAML.

```text
.github/workflows/
├── _deploy.yml          ← reusable: accepts env name as input
├── ci.yml               ← push to development → calls _deploy with env=test
├── promote-staging.yml  ← manual or merge → calls _deploy with env=staging
└── promote-prod.yml     ← release tag or manual approval → calls _deploy with env=prod
```

### Artifact Promotion Model

The key discipline: build the Docker image once on push to development, tag it with the git SHA, and promote that exact image through environments. Never rebuild for staging or production. This guarantees what was tested in test is exactly what ships to production.

```text
push to development
  → build + push image (tagged with git SHA)
  → deploy to test        (automatic)
  → smoke tests pass
  → deploy to staging     (automatic or manual gate)
  → deploy to production  (manual approval)
```

---

## Acceptance Criteria

- Given a push to development, when the CI pipeline runs, then a Docker image is built once (tagged with git SHA) and deployed to test — the same image tag is reused for staging and production without rebuilding.
- Given staging and production environments need to be provisioned, when Terraform is applied for those environments, then each is defined by a thin root module calling a shared modules/app-environment/ with environment-specific variables — no resource logic is duplicated.
- Given the GitHub Actions deploy workflow exists, when a new environment is targeted, then deployment is handled by a single reusable _deploy.yml called with an environment name as input — there is no duplicated deploy job logic across workflow files.

---

## Linked Issues

_(none)_

## Subtasks

_(none)_

## Comments

_(none)_

## Attachments

_(none)_

---
ticket: PLATFORM-3
fetched: 2026-05-04T20:30:00-07:00
jira_updated: 2026-05-04T13:25:17.896-0700
---

# Apply terraform release for sample web application

| Field | Value |
|---|---|
| **Summary** | Apply terraform release for sample web application |
| **Status** | Created |
| **Priority** | Medium |
| **Type** | Story |
| **Assignee** | Goulart, Frank |
| **Reporter** | Goulart, Frank |
| **Created** | 2026-04-23T15:13:46.562-0700 |
| **Updated** | 2026-05-04T13:25:17.896-0700 |
| **Labels** | (none) |
| **Sprint** | (none) |
| **Components** | (none) |

## Description

As a platform engineer, I want to replace the manually provisioned Azure infrastructure for app-insights-explorer with Terraform IaC so that the infrastructure is reproducible, version-controlled, and can be provisioned consistently across environments.

### Context

This story completes a three-part platform engineering tutorial:

- **PLATFORM-1** — Provision all Azure infrastructure by hand, step by step
- **PLATFORM-29** — Set up GitHub Actions CI/CD workflows from scratch, step by step
- **PLATFORM-3** — Replace the hand-provisioned infrastructure with Terraform IaC, step by step

Like its predecessors, this story is a slow, deliberate walkthrough — not just a task to complete. Each Terraform resource is introduced one at a time with an explanation of what it does, why it exists, and how it connects to the resources around it. The resulting code should be directly traceable to the PLATFORM-1 manual provisioning steps.

### Acceptance Criteria

- Given a clean Azure subscription, when I run the bootstrap script and `terraform apply infra/shared/`, then the ACR, OIDC federated credential, SSO App Registration, and GitHub variables are provisioned.
- Given `infra/shared/` has been applied, when I run `terraform apply infra/envs/test/`, then the resource group, App Service Plan, frontend and API web apps (with system-assigned managed identities), Key Vault, all RBAC role assignments, and all App Service settings are provisioned with correct names and values.
- Given the Terraform-managed infrastructure is in place, when the CI/CD pipeline from PLATFORM-29 runs, then both App Services deploy successfully and the smoke tests pass.
- Given another developer reads the Terraform code, when they compare it to the PLATFORM-1 manual provisioning walkthrough, then every resource from that walkthrough has a corresponding Terraform resource and nothing is left as a manual step.

## Linked Issues

(none)

## Subtasks

(none)

## Comments

(none)

## Attachments

(none)

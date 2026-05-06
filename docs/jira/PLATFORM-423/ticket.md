---
ticket: PLATFORM-423
fetched: 2026-05-06T20:30:00-07:00
jira_updated: 2026-05-06T12:53:05.739-0700
---

# Add GitHub Actions workflows to run Terraform plan/apply for infrastructure changes

| Field | Value |
|---|---|
| **Summary** | Add GitHub Actions workflows to run Terraform plan/apply for infrastructure changes |
| **Status** | In Progress |
| **Priority** | Medium |
| **Type** | Story |
| **Assignee** | Goulart, Frank |
| **Reporter** | Goulart, Frank |
| **Created** | 2026-05-06T12:43:23.413-0700 |
| **Updated** | 2026-05-06T12:53:05.739-0700 |
| **Labels** | (none) |
| **Sprint** | PLATFORM Sprint 3 |
| **Components** | (none) |

## Description

As a platform engineer, I want GitHub Actions workflows to run terraform plan and terraform apply automatically so that infrastructure changes are provisioned by merging code rather than running manual commands locally.

## Acceptance Criteria

- Given a PR is opened against `development` that includes changes to `infra/`, when the PR workflow runs, then `terraform plan` is executed for both `infra/shared/` and `infra/envs/test/` and the plan output is posted as a comment on the PR.
- Given a commit is merged to `development` that includes changes to `infra/`, when the CI workflow runs, then `terraform apply` is executed for `infra/shared/` followed by `infra/envs/test/` in sequence, and the apply completes without error.

## Linked Issues

(none)

## Subtasks

(none)

## Comments

(none)

## Attachments

(none)

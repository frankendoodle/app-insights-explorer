---
ticket: PLATFORM-3
slug: apply-terraform-release-for-sample-web-application
summary: "Apply terraform release for sample web application"
status: implemented
issuetype: Story
fetched: 2026-05-04T20:30:00-07:00
jira_updated: 2026-05-04T13:25:17.896-0700
jira_url: https://marcusmillichap.atlassian.net/browse/PLATFORM-3
linked_issues: []
subtasks: []
confluence:
  - id: "1895268417"
    title: "Terraform App Registration Guide"
    source: search
    slug: terraform-app-registration-guide
  - id: "1894645810"
    title: "Q&A"
    source: search
    slug: terraform-app-registration-qa
  - id: "1895071805"
    title: "Ops"
    source: search
    slug: ops
specs:
  - slug: terraform-release
    discovery: specs/terraform-release-discovery.md
    spec: specs/terraform-release-spec-2026-05-04.md
    subtask_key: PLATFORM-354
    pushed: 2026-05-04T16:05:00-07:00
plans:
  - slug: terraform-release
    plan: plans/terraform-release-plan-2026-05-04.md
container_subtask_key: PLATFORM-354
---

# Apply Terraform to Sample Web App — Ticket Dossier

Dossier for PLATFORM-3 — covers specs, plans, and pipeline status for replacing manually provisioned Azure infrastructure with Terraform IaC.

**Status:** Created | **Priority:** Medium | **Assignee:** Goulart, Frank
**Last fetched:** 2026-05-04 | **Jira updated:** 2026-05-04

## Status at a Glance

| Spec | Spec Status | Plan | Implementation |
|---|---|---|---|
| terraform-release | final, pushed | approved | done |

**Next actions:** `/jira:verify PLATFORM-3`

## Pipeline

- [x] fetch
- [x] spec-feature
- [x] plan-code
- [x] implement
- [ ] verify
- [ ] qa-handoff
- [ ] archive

## Files

- [ticket.md](ticket.md) — Jira ticket snapshot
- specs/ — 1 spec (terraform-release, final)
- plans/ — (empty)
- confluence/ — 3 pages
- validation/ — (empty)

## Linked Issues

(none)

## Implementation

Branch: `fg/platform-3`
Final commit: 121546d (PLATFORM-3: add Key Vault secret-population and App Service stop/start steps to ci-test.yml)

12 tasks completed covering: bootstrap.sh idempotency, infra/shared/ (ACR, SSO App Registration Path A/B, OIDC fedcred), infra/envs/test/ (resource group, ASP, web apps, Key Vault, RBAC x5, App Service settings), and ci-test.yml Key Vault secret-population extension.

## Notes

(User-editable section — preserved across re-fetches)

---
ticket: PLATFORM-456
slug: terraform-extract-module-and-env-roots
summary: "Terraform: extract module and env roots"
status: plan-complete
issuetype: Sub-task
parent_key: PLATFORM-453
parent_summary: "Refactor IaC and CI/CD Pipeline for Environment Promotion"
fetched: 2026-05-08T09:35:00-07:00
jira_updated: 2026-05-08T09:29:49.886-0700
jira_url: https://marcusmillichap.atlassian.net/browse/PLATFORM-456
linked_issues: []
subtasks: []
confluence: []
specs:
  - slug: terraform-module-extract
    discovery: specs/terraform-module-extract-discovery.md
    spec: specs/terraform-module-extract-spec-2026-05-08.md
    subtask_key: null
    pushed: 2026-05-08T17:12:00Z
plans:
  - slug: terraform-module-extract
    file: plans/terraform-module-extract-plan-2026-05-08.md
    status: pending
    implement_subtask: PLATFORM-458
container_subtask_key: null
---

# Terraform Module and Env Roots Extraction — Ticket Dossier

Dossier for PLATFORM-456 — covers specs, plans, and pipeline status for the Terraform module extraction and environment roots refactor.

**Status:** Created (To Do) | **Priority:** Medium | **Assignee:** Unassigned
**Last fetched:** 2026-05-08 | **Jira updated:** 2026-05-08

## Status at a Glance

| Spec | Spec Status | Plan | Implementation |
|---|---|---|---|
| terraform-module-extract | final, pushed | pending | — |

**Next actions:** `/jira:implement-plan PLATFORM-456 terraform-module-extract`

## Pipeline

- [x] fetch
- [x] spec-feature
- [x] plan-code
- [ ] implement
- [ ] verify
- [ ] qa-handoff
- [ ] archive

## Files

- [ticket.md](ticket.md) — Jira ticket snapshot
- specs/
  - [terraform-module-extract-discovery.md](specs/terraform-module-extract-discovery.md)
  - [terraform-module-extract-spec-2026-05-08.md](specs/terraform-module-extract-spec-2026-05-08.md)
  - [terraform-module-extract-challenges-2026-05-08.md](specs/terraform-module-extract-challenges-2026-05-08.md)
- plans/
  - [terraform-module-extract-plan-2026-05-08.md](plans/terraform-module-extract-plan-2026-05-08.md)
  - [manifest.md](plans/manifest.md)
- confluence/ — (empty)
- validation/ — (empty)

## Linked Issues

_(none)_

## Notes


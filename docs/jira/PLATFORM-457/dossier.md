---
ticket: PLATFORM-457
slug: github-actions-reusable-deploy-workflow
summary: "GitHub Actions: reusable deploy workflow with SHA promotion"
status: plan-complete
issuetype: Sub-task
parent_key: PLATFORM-453
parent_summary: "Refactor IaC and CI/CD Pipeline for Environment Promotion"
fetched: 2026-05-08T17:45:00Z
jira_updated: 2026-05-08T17:14:30Z
jira_url: https://marcusmillichap.atlassian.net/browse/PLATFORM-457
linked_issues: []
subtasks: []
confluence: []
specs:
  - slug: deploy-workflow
    discovery: specs/deploy-workflow-discovery.md
    spec: specs/deploy-workflow-spec-2026-05-08.md
    subtask_key: null
    pushed: 2026-05-08T19:50:00Z
plans:
  - slug: deploy-workflow
    file: plans/deploy-workflow-plan-2026-05-08.md
    status: approved
container_subtask_key: null
---

# GitHub Actions Reusable Deploy Workflow — Ticket Dossier

Dossier for PLATFORM-457 — covers specs, plans, and pipeline status for the reusable GitHub Actions deploy workflow and SHA-based image promotion feature.

**Status:** Created (To Do) | **Priority:** Medium | **Assignee:** Goulart, Frank
**Last fetched:** 2026-05-08 | **Jira updated:** 2026-05-08

## Status at a Glance

| Spec | Spec Status | Plan | Implementation |
|---|---|---|---|
| deploy-workflow | final, pushed | approved | done |

**Next actions:** `/jira:verify PLATFORM-457`

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
- specs/
  - [deploy-workflow-discovery.md](specs/deploy-workflow-discovery.md)
  - [deploy-workflow-spec-2026-05-08.md](specs/deploy-workflow-spec-2026-05-08.md)
- plans/
  - [deploy-workflow-plan-2026-05-08.md](plans/deploy-workflow-plan-2026-05-08.md)
  - [manifest.md](plans/manifest.md)
- confluence/ — (empty)
- validation/ — (empty)

## Linked Issues

(None)

## Notes

(User-editable section — preserved across re-fetches)

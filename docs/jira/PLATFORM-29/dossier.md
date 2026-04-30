---
ticket: PLATFORM-29
slug: set-up-git-actions-for-sample-web-application
summary: "Set up git actions for sample web application"
status: fetched
issuetype: Story
fetched: 2026-04-30T15:10:00-07:00
jira_updated: 2026-04-30T15:02:43.744-0700
jira_url: https://marcusmillichap.atlassian.net/browse/PLATFORM-29
linked_issues: []
subtasks:
  - key: PLATFORM-291
    summary: "Remove legacy CI/CD files (pr.yml, ci.yml, staging ymls)"
    status: "Created"
  - key: PLATFORM-292
    summary: "Configure GitHub Actions OIDC variables (AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID)"
    status: "Created"
  - key: PLATFORM-293
    summary: "Configure GitHub Actions deployment variables (ACR_LOGIN_SERVER, RESOURCE_GROUP, WEBAPP_FRONTEND, WEBAPP_API)"
    status: "Created"
  - key: PLATFORM-294
    summary: "Create test GitHub Environment in repo settings"
    status: "Created"
  - key: PLATFORM-295
    summary: "Create pr.yml — trigger on PR to development, job skeleton"
    status: "Created"
  - key: PLATFORM-296
    summary: "Add Docker build step for frontend image to pr.yml (no push)"
    status: "Created"
  - key: PLATFORM-297
    summary: "Add Docker build step for API image to pr.yml (no push)"
    status: "Created"
  - key: PLATFORM-298
    summary: "Create ci.yml — trigger on push to development, job skeleton"
    status: "Created"
  - key: PLATFORM-299
    summary: "Add OIDC Azure login step to ci.yml"
    status: "Created"
  - key: PLATFORM-300
    summary: "Add Docker build and push to ACR for frontend"
    status: "Created"
  - key: PLATFORM-301
    summary: "Add Docker build and push to ACR for API"
    status: "Created"
  - key: PLATFORM-302
    summary: "Add App Service deploy step for frontend"
    status: "Created"
  - key: PLATFORM-303
    summary: "Add App Service deploy step for API"
    status: "Created"
  - key: PLATFORM-304
    summary: "Add smoke test step (curl health check on both App Service URLs)"
    status: "Created"
  - key: PLATFORM-305
    summary: "Validate PR workflow with a test branch PR"
    status: "Created"
  - key: PLATFORM-306
    summary: "Validate CI workflow with a merge to development"
    status: "Created"
confluence: []
specs: []
plans: []
container_subtask_key: null
---

# GitHub Actions CI/CD Setup — Ticket Dossier

Dossier for PLATFORM-29 — covers specs, plans, and pipeline status for setting up GitHub Actions CI/CD for the app-insights-explorer sample web application.

**Status:** Created | **Priority:** Medium | **Assignee:** Goulart, Frank
**Last fetched:** 2026-04-30 | **Jira updated:** 2026-04-30

## Status at a Glance

No specs written yet. Run `/jira:spec-feature PLATFORM-29` to begin.

**Next actions:** `/jira:spec-feature PLATFORM-29`

## Pipeline

- [x] fetch
- [ ] spec-feature
- [ ] plan-code
- [ ] implement
- [ ] verify
- [ ] qa-handoff
- [ ] archive

## Files

- [ticket.md](ticket.md) — Jira ticket snapshot
- specs/ — (empty)
- plans/ — (empty)
- confluence/ — empty
- validation/ — (empty)

## Linked Issues

(none)

## Notes

(User-editable section — preserved across re-fetches)

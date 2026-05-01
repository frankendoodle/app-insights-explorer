---
ticket: PLATFORM-1
slug: provision-web-application-infrastructure-by-hand-for-sample
summary: "Provision web application infrastructure by hand for sample web application"
status: archived
issuetype: Story
fetched: 2026-04-27T16:45:00-07:00
jira_updated: 2026-04-27T16:33:41.572-0700
jira_url: https://marcusmillichap.atlassian.net/browse/PLATFORM-1
linked_issues: []
subtasks:
  - key: PLATFORM-199
    summary: "Create resource group rg-app-insights-explorer-test"
    status: "Created"
  - key: PLATFORM-200
    summary: "Create Azure Container Registry (ACR)"
    status: "Created"
  - key: PLATFORM-201
    summary: "Create App Service Plan"
    status: "Created"
  - key: PLATFORM-202
    summary: "Create Web App (Linux, Docker) for frontend"
    status: "Created"
  - key: PLATFORM-203
    summary: "Create Web App (Linux, Docker) for API"
    status: "Created"
  - key: PLATFORM-204
    summary: "Create Key Vault"
    status: "Created"
  - key: PLATFORM-205
    summary: "Enable system-assigned managed identity on both App Services"
    status: "Created"
  - key: PLATFORM-206
    summary: "Assign AcrPull role to App Service managed identities"
    status: "Created"
  - key: PLATFORM-207
    summary: "Assign Key Vault Secrets User role to App Service managed identities"
    status: "Created"
  - key: PLATFORM-208
    summary: "Create App Registration and Service Principal"
    status: "Created"
  - key: PLATFORM-209
    summary: "Create federated identity credential for GitHub Actions OIDC"
    status: "Created"
  - key: PLATFORM-210
    summary: "Assign Contributor and AcrPush roles to the Service Principal"
    status: "Created"
  - key: PLATFORM-211
    summary: "Populate Key Vault with application secrets"
    status: "Created"
confluence: []
specs:
  - slug: provision-azure-infra
    discovery: specs/provision-azure-infra-discovery.md
    spec: specs/provision-azure-infra-spec-2026-04-27.md
    subtask_key: PLATFORM-259
    pushed: 2026-04-28T00:00:00Z
plans:
  - slug: provision-azure-infra
    file: plans/provision-azure-infra-plan-01.md
    slot: 1
    status: complete
    depends_on: []
container_subtask_key: null
---

# Provision Web App Infrastructure by Hand — Ticket Dossier

Dossier for PLATFORM-1 — covers specs, plans, and pipeline status for the manual Azure infrastructure provisioning initiative for app-insights-explorer.

**Status:** Created | **Priority:** Medium | **Assignee:** Goulart, Frank
**Last fetched:** 2026-04-27 | **Jira updated:** 2026-04-27

## Status at a Glance

| Spec | Spec Status | Plan | Implementation |
|---|---|---|---|
| provision-azure-infra | final, pushed | complete | done |

**Next actions:** `/jira:verify PLATFORM-1`

## Pipeline

- [x] fetch
- [x] spec-feature
- [x] plan-code
- [x] implement
- [ ] verify
- [ ] qa-handoff
- [x] archive

## Files

- [ticket.md](ticket.md) — Jira ticket snapshot
- specs/
  - [provision-azure-infra-discovery.md](specs/provision-azure-infra-discovery.md)
  - [provision-azure-infra-spec-2026-04-27.md](specs/provision-azure-infra-spec-2026-04-27.md)
  - [provision-azure-infra-challenges-2026-04-27.md](specs/provision-azure-infra-challenges-2026-04-27.md) — all resolved
- plans/ — (empty)
- confluence/ — empty
- validation/ — (empty)

## Linked Issues

(none)

## Notes

(User-editable section — preserved across re-fetches)

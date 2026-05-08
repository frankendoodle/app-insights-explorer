---
ticket: PLATFORM-456
fetched: 2026-05-08T09:35:00-07:00
jira_updated: 2026-05-08T09:29:49.886-0700
---

# PLATFORM-456 — Terraform: extract module and env roots

| Field | Value |
|---|---|
| **Summary** | Terraform: extract module and env roots |
| **Status** | Created (To Do) |
| **Priority** | Medium |
| **Type** | Sub-task |
| **Parent** | [PLATFORM-453](../PLATFORM-453/dossier.md) — Refactor IaC and CI/CD Pipeline for Environment Promotion |
| **Assignee** | Unassigned |
| **Reporter** | Goulart, Frank |
| **Created** | 2026-05-08T09:29:49-07:00 |
| **Updated** | 2026-05-08T09:29:49-07:00 |
| **Sprint** | PLATFORM Sprint 3 |
| **Labels** | _(none)_ |
| **Components** | _(none)_ |
| **Epic** | _(none)_ |

---

## Description

Extract all environment-specific resource definitions (App Service plan, web apps, Key Vault, RBAC) from infra/envs/test/ into a reusable module at infra/modules/app-environment/. Add thin env roots for staging and production that call the module with environment-specific variable values. No resource logic should be duplicated across env roots.

---

## Acceptance Criteria

_(inherited from parent PLATFORM-453)_

- Given staging and production environments need to be provisioned, when Terraform is applied for those environments, then each is defined by a thin root module calling a shared modules/app-environment/ with environment-specific variables — no resource logic is duplicated.

---

## Linked Issues

_(none)_

## Subtasks

_(none)_

## Comments

_(none)_

## Attachments

_(none)_

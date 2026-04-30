---
ticket: PLATFORM-1
fetched: 2026-04-27T16:45:00-07:00
jira_updated: 2026-04-27T16:33:41.572-0700
---

# Provision web application infrastructure by hand for sample web application

| Field | Value |
|---|---|
| **Summary** | Provision web application infrastructure by hand for sample web application |
| **Status** | Created |
| **Priority** | Medium |
| **Type** | Story |
| **Assignee** | Goulart, Frank |
| **Reporter** | Goulart, Frank |
| **Created** | 2026-04-23T15:15:48.094-0700 |
| **Updated** | 2026-04-27T16:33:41.572-0700 |
| **Labels** | (none) |
| **Sprint** | (none) |
| **Components** | (none) |

## Description

As a platform engineer, I want to manually provision all Azure infrastructure required for the test deployment of app-insights-explorer so that I have a documented, step-by-step reference for each resource and the reason it exists.

This story is part of a larger effort to learn gitactions and terraform. The related stories are: [PLATFORM-29](https://marcusmillichap.atlassian.net/browse/PLATFORM-29) and [PLATFORM-3](https://marcusmillichap.atlassian.net/browse/PLATFORM-3). Therefore, we are planning to provision azure resources for a web application(s), then establishing git actions to deploy to the infrastructure, then we will replace the manually created infrastructure with terraform IaC.

Additional context: This started out as a learning exercise to teach a dev about how git actions and terraform are used to configure and run cicd pipelines to provision and release applications to Azure. The initial attempt was only moderately successful. Too much trial and error created a messy result where some parts of the solution were automated and some were manual. Basically, the agent tried to do too many things at once, getting many things incorrect and leaving the developer with questions about "how we got here." This attempt is to slow the process down. First we will create infrastructure manually, step by step, that way the dev understands what we will automate later with terraform. The agent should treat this process as a slow and detailed tutorial. We aren't trying to simply complete a development/devops task, we are trying to teach devops to a developer.

Additionally, the original solution retains some of the previous attempts' artifacts. These can be used as added context, but should only drive decision making if what was done previously was worth saving.

Repo: `C:\src\PersonalGit\app-insights-explorer`

## Acceptance Criteria

- Given I start from scratch, when I follow the provisioning steps in order, then all required resources exist in `rg-app-insights-explorer-test` with correct names and configurations.
- Given the infrastructure is provisioned, when the CI/CD pipeline runs, then both the web and API containers are built, pushed to ACR, and deployed successfully.
- Given provisioning is complete, when another developer reads the artifact, then they can reproduce the same infrastructure without additional guidance.

## Linked Issues

(none — PLATFORM-29 and PLATFORM-3 referenced in description text, not as formal Jira issue links)

## Subtasks

| Key | Summary | Status |
|---|---|---|
| PLATFORM-199 | Create resource group rg-app-insights-explorer-test | Created |
| PLATFORM-200 | Create Azure Container Registry (ACR) | Created |
| PLATFORM-201 | Create App Service Plan | Created |
| PLATFORM-202 | Create Web App (Linux, Docker) for frontend | Created |
| PLATFORM-203 | Create Web App (Linux, Docker) for API | Created |
| PLATFORM-204 | Create Key Vault | Created |
| PLATFORM-205 | Enable system-assigned managed identity on both App Services | Created |
| PLATFORM-206 | Assign AcrPull role to App Service managed identities | Created |
| PLATFORM-207 | Assign Key Vault Secrets User role to App Service managed identities | Created |
| PLATFORM-208 | Create App Registration and Service Principal | Created |
| PLATFORM-209 | Create federated identity credential for GitHub Actions OIDC | Created |
| PLATFORM-210 | Assign Contributor and AcrPush roles to the Service Principal | Created |
| PLATFORM-211 | Populate Key Vault with application secrets | Created |

## Comments

(none)

## Attachments

(none)

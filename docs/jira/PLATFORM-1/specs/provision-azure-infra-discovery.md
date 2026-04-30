---
title: "Azure Infrastructure Provisioning — Feature Discovery"
ticket: PLATFORM-1
slug: provision-azure-infra
date: 2026-04-27
tags: [ai/generated, jira/discovery]
status: specs_complete
specs:
  - slug: provision-azure-infra
    file: specs/provision-azure-infra-spec-2026-04-27.md
    status: complete
---

# Azure Infrastructure Provisioning — Feature Discovery

## Story Context

PLATFORM-1 asks a platform engineer to manually provision all Azure infrastructure required for the test deployment of `app-insights-explorer` — a two-container web app (Next.js frontend + NestJS API backend). The provisioning is intentionally sequential and pedagogical: each resource is created step by step so the developer understands what it is and why it exists before it gets automated away by Terraform in a subsequent story.

The technical reading: create a defined set of Azure resources in `rg-app-insights-explorer-test`, in a specific order driven by dependencies between them, and produce a documented walkthrough that another developer can follow from scratch.

## Dialog Summary

- **Existing IaC artifacts are out of scope.** The repo contains Terraform files and GitHub Actions workflows from a previous attempt. These are not authoritative for PLATFORM-1 and should not drive provisioning decisions, though they may be useful as reference in later stories.
- **Target environment is a personal Azure subscription** (non-work, single user — personal Yahoo/Microsoft account). No enterprise tenant, no approval gates.
- **Two App Registrations are required:** one for NextAuth.js SSO (frontend user authentication via Microsoft Entra ID) and one for the CI/CD service principal (GitHub Actions OIDC). These are independent concerns and must not be combined.
- **Backend is not Entra ID-protected.** The NestJS API uses a shared API key guard (`BACKEND_API_SECRET`) — not Azure AD. SSO covers only the frontend user session.
- **Managed identities handle all runtime credential needs.** App Services pull images from ACR and read secrets from Key Vault via system-assigned managed identities with scoped role assignments. No stored credentials in app configuration.
- **GitHub Actions authenticates via OIDC.** The service principal gets a federated identity credential scoped to the `development` branch. No Azure client secret is stored in GitHub.
- **All resources use the cheapest available tier.** App Service Plan F1 (free) where Docker is supported, otherwise B1; ACR Basic; Key Vault Standard. Specific SKU decisions deferred to implementation.
- **The spec is the primary artifact.** The goal is a documented, ordered walkthrough explaining why each resource exists — not just a checklist — so the developer can reproduce the infrastructure and understand what Terraform will later manage.

## Key Design Decisions

### Two separate App Registrations

One App Registration handles NextAuth.js → Entra ID SSO for frontend user authentication (web platform, OAuth/OIDC callback, personal Microsoft account support via `common` tenant). A second App Registration backs the CI/CD service principal (no redirect URIs, OIDC federated credential only). Separating them keeps auth concerns isolated: the SSO registration has client secrets and user-facing redirect URIs; the CI/CD registration has federated credentials and subscription-level role assignments. Naming baseline from previous attempt: `app-insights-explorer-sso` and `sp-app-insights-explorer-cicd`.

### Managed identity over stored credentials

App Services are assigned system-assigned managed identities rather than storing ACR credentials or Key Vault access keys in app settings. AcrPull role grants image pull rights; Key Vault Secrets User role grants secret read rights. This eliminates credential rotation risk and follows Azure-recommended practice for containerized App Services.

### OIDC federated credential over stored client secret

The CI/CD service principal uses an OIDC federated credential rather than a long-lived client secret stored in GitHub. GitHub Actions obtains a short-lived token at runtime by proving its identity via the OIDC protocol. This removes a secret rotation dependency and is the current Azure/GitHub Actions recommended pattern.

### Backend protected by shared API key

The NestJS API does not participate in Azure AD authentication. It is protected by a shared secret header (`x-api-key: BACKEND_API_SECRET`) validated by a NestJS global guard. This is appropriate for a single-user POC where the frontend is the only consumer of the backend. The SSO App Registration only needs to configure the frontend's OAuth flow.

### Free/cheapest tier throughout

All resources use the least expensive or free SKU. The spec documents this as a deliberate constraint — not an oversight — so future stories can reference it when deciding whether to scale up for staging or production environments.

## Delivery Assessment

Readiness: Code-ready
Blocking Items: None
Decomposition: None — the 13 provisioning steps are sequential and interdependent; splitting would create artificial handoffs.

## Spec Manifest

1. **`provision-azure-infra-spec-2026-04-27.md`** — Full Azure infrastructure provisioning spec. Covers all 13 resource creation steps in order, explains the dependency chain between resources, documents all design decisions, and defines what the spec does not address (existing IaC, other environments, Terraform migration).

[[provision-azure-infra-spec-2026-04-27]]

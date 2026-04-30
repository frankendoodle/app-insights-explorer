---
title: "Azure Infrastructure Provisioning — Feature Spec"
ticket: PLATFORM-1
slug: provision-azure-infra
discovery: specs/provision-azure-infra-discovery.md
date: 2026-04-27
tags: [ai/generated, jira/feature-spec]
status: final
stale: false
---

# Azure Infrastructure Provisioning — Feature Spec

## 1. Overview

This spec covers the manual provisioning of all Azure infrastructure required to run the `app-insights-explorer` application in its test environment. The application is a two-container Docker web app: a Next.js frontend and a NestJS API backend, both hosted as Linux Docker App Services on a shared App Service Plan. The infrastructure lives in a dedicated resource group (`rg-app-insights-explorer-test`) under a personal Azure subscription.

Provisioning is intentionally manual and sequential — each resource is created one step at a time so the developer understands what it is, why it exists, and how it relates to the resources created before and after it. This walkthrough is the primary artifact: a reproducible, annotated reference that will inform the Terraform automation planned in a subsequent story.

## 2. Delivery Assessment

```
Readiness: Code-ready
Blocking Items:
- None
Decomposition:
- None identified — the 13 provisioning steps are sequentially dependent
  and form a single implementable unit
```

## 3. Technical Context

`app-insights-explorer` is a personal-account proof-of-concept that queries Azure Application Insights telemetry and uses Claude AI to triage application errors. It has no organizational users — the only user is the developer's personal Microsoft account (linked to a Yahoo email address). All Azure resources live in a single personal subscription.

A previous provisioning attempt exists in the repository but produced a mixed result — some steps were automated, some manual, and the developer's understanding of the resulting architecture was incomplete. PLATFORM-1 starts fresh, treating the previous artifacts as reference material only. Any resources from the previous attempt that remain in Azure are assumed to have been cleaned up or are irrelevant to this story.

The application's runtime authentication model is two-tier:
- **Frontend user authentication**: NextAuth.js + Microsoft Entra ID OAuth/OIDC. The frontend requires a user session before rendering any content.
- **Backend API protection**: a shared API key validated by a NestJS global guard. The backend is not an Entra ID resource and does not validate Azure AD tokens.

## 4. Technical Scope

The following Azure systems and constructs are in scope:

- **Resource group** — the container for all other resources; named `rg-app-insights-explorer-test`
- **Azure Container Registry (ACR)** — stores Docker images for both the frontend and API containers
- **App Service Plan** — the compute tier that hosts both App Service web apps
- **App Service web apps (×2)** — one for the frontend container, one for the API container; both Linux Docker
- **Azure Key Vault** — stores application secrets that the App Services read at runtime
- **System-assigned managed identities** — one per App Service; used for credential-free access to ACR and Key Vault
- **Role assignments** — AcrPull (managed identity → ACR) and Key Vault Secrets User (managed identity → Key Vault) for each App Service
- **App Registration: SSO** — Entra ID OAuth/OIDC registration used by NextAuth.js for frontend user authentication
- **App Registration: CI/CD service principal** — Entra ID App Registration that backs the GitHub Actions service principal; receives an OIDC federated credential and Contributor + AcrPush role assignments
- **OIDC federated credential** — attached to the CI/CD App Registration; scoped to the `development` branch of the GitHub repository
- **Key Vault secrets** — sensitive application secrets stored in Key Vault and read by App Services via managed identity at startup: SSO client ID (`AppRegistrationClientId`), SSO client secret (`AppRegistrationClientSecret`), Anthropic API key (`AnthropicApiKey`), backend shared secret (`BackendApiSecret`), NextAuth encryption key (`NextAuthSecret`)
- **App Service application settings** — non-sensitive, environment-specific configuration set directly on each App Service after creation (not stored in Key Vault): `NEXTAUTH_URL` (frontend OAuth callback base URL, set on the frontend App Service), `NEXT_PUBLIC_API_URL` (backend URL consumed by the frontend, set on the frontend App Service), `FRONTEND_ORIGIN` (frontend URL used to configure backend CORS, set on the API App Service), `AppRegistrationTenantId` (Entra ID tenant — set to `consumers` for personal Microsoft accounts)

## 5. Key Design Decisions

### Two separate App Registrations

The SSO App Registration and the CI/CD App Registration are created independently and serve different purposes. The SSO registration is a web-platform OAuth/OIDC client: it has a client secret, redirect URIs pointing to the frontend callback endpoint, and is configured to accept personal Microsoft accounts via the `common` authority endpoint. The CI/CD registration has none of these — it exists solely to back a service principal that GitHub Actions can impersonate via OIDC. Combining them would couple unrelated credential lifecycles and create confusion about what each secret or credential is for. Naming follows the pattern established in the previous attempt: `app-insights-explorer-sso` and `sp-app-insights-explorer-cicd`.

### Managed identity over stored registry credentials

Rather than storing ACR username/password or access keys in App Service application settings, each App Service is granted a system-assigned managed identity with the AcrPull role scoped to the ACR instance. Azure handles the credential exchange at image pull time. This eliminates the need to rotate stored credentials and is the Azure-recommended pattern for containerized App Services pulling from ACR in the same subscription.

### Key Vault reference pattern for application secrets

Application secrets (SSO credentials, API keys, the NextAuth secret) are stored in Key Vault rather than in App Service application settings as plaintext. Each App Service managed identity is granted Key Vault Secrets User role, which allows it to retrieve individual secrets but not list or manage the vault. This scoping means a compromised App Service cannot enumerate the vault's contents.

### OIDC federated credential over stored client secret

GitHub Actions authenticates to Azure using an OIDC federated credential rather than a long-lived client secret stored as a GitHub secret. The federated credential is scoped to the `development` branch. At pipeline runtime, GitHub presents a signed OIDC token to Azure, which exchanges it for a short-lived access token. No Azure credential is ever stored in GitHub's secret store. This is the current Azure/GitHub recommended pattern and eliminates client secret rotation entirely.

### Backend is not Entra ID-protected

The NestJS API does not validate Azure AD tokens. It is protected by a shared secret (`BACKEND_API_SECRET`) exchanged as an HTTP header between the frontend and backend. This is appropriate for a single-user POC where the frontend is the sole consumer of the API. The SSO App Registration needs only to support the frontend's OAuth login flow — no API scope or resource exposure is required on the Entra ID side.

### Free/cheapest tier throughout

Every resource is provisioned at the minimum viable SKU: App Service Plan F1 (free tier) if Docker image support is available, otherwise B1 (lowest paid); ACR Basic; Key Vault Standard (Azure has no free Key Vault tier — Standard is the lowest available). This constraint is intentional and documented so future stories can make an informed decision about whether to scale up for staging or production contexts.

## 6. Technical Dependencies

- **Personal Azure subscription** — an active personal Microsoft Azure subscription is required; all resources are provisioned within it
- **Azure CLI or Azure Portal access** — provisioning is done manually via CLI commands or portal UI; no automation tooling required at this stage
- **GitHub repository** — the OIDC federated credential is bound to a specific GitHub organization, repository, and branch (`development`); the repository must exist before the federated credential can be created
- **Docker images** — the App Services are configured to pull from ACR; actual image pushes are handled by a subsequent CI/CD story, but ACR must exist and the App Services must be configured with the correct ACR login server URL before deployment can succeed
- **Key Vault secrets** — the App Services reference Key Vault secrets at startup; the secrets must be populated before the applications can start successfully

## 7. Technical Concerns & Risks

**App Service Plan F1 and Docker:** The F1 (free) App Service Plan tier does not support custom Docker containers on Linux — it requires at least B1. This is a known Azure constraint. The provisioning step for the App Service Plan must confirm whether F1 is sufficient or whether B1 is required; if B1 is needed, the cost implication should be noted in the walkthrough artifact.

**Key Vault Standard cost:** Azure does not offer a free Key Vault tier. Key Vault Standard incurs a small per-operation charge. For a low-traffic POC this is negligible, but it should be explicitly noted in the provisioning walkthrough so the developer is not surprised.

**Personal Microsoft account and Entra ID tenant:** The developer's Yahoo email is a Microsoft personal account. For NextAuth.js token validation to work correctly, `AppRegistrationTenantId` must be set to `consumers` (the Microsoft personal account endpoint) rather than `common`. Using `common` causes issuer mismatch during token validation because the token is issued by the personal account tenant (`9188040d-6c67-4c5b-b112-36a304b66dad`), not the generic common tenant. This value is set as an App Service application setting on the frontend App Service after creation.

**Backend code excludes managed identity:** The NestJS backend currently instantiates `DefaultAzureCredential` with `excludeManagedIdentityCredential: true`. As written, the provisioned system-assigned managed identity will never be used at runtime — the credential chain will skip it and fall back to sources (Azure CLI, VS Code) that do not exist inside an App Service container. A one-line code change removing this exclusion flag is required before the managed identity path is functional. This is a known gap between the current code state and the infrastructure being provisioned; it must be addressed before or alongside deployment.

**Managed identity and ACR in the same subscription:** The AcrPull role assignment requires the managed identity and ACR to be in the same subscription. Since everything is in a single personal subscription, this is satisfied automatically — but worth noting if the architecture ever splits across subscriptions.

**OIDC federated credential scope:** The federated credential is scoped to the `development` branch. Pushes or pipeline runs from other branches will not be able to authenticate. This is intentional for the POC but must be revisited if branch protection or multi-environment pipelines are added.

## 8. Non-Scope

- **Existing Terraform IaC and GitHub Actions workflows** — artifacts from the previous provisioning attempt are not modified, cleaned up, or superseded by this story. They are reference material only.
- **Staging and production environments** — only `rg-app-insights-explorer-test` is provisioned here. Other environments are future scope.
- **Terraform migration** — converting this manual provisioning to Terraform IaC is the explicit goal of a subsequent story (PLATFORM-3); it is not part of this spec.
- **GitHub Actions CI/CD pipeline** — configuring and running the pipeline is covered by a separate story (PLATFORM-29); this story only provisions the Azure-side prerequisites (ACR, App Service configuration, OIDC federated credential, role assignments) that the pipeline will depend on.
- **Application deployment** — pushing Docker images to ACR and deploying containers to App Services is out of scope here; this story ends when the infrastructure is provisioned and secrets are populated.
- **DNS and custom domains** — App Services will use their default `azurewebsites.net` hostnames; no custom domain configuration is in scope.
- **Monitoring and alerting** — Application Insights workspace setup and alert rules are not part of this provisioning pass.

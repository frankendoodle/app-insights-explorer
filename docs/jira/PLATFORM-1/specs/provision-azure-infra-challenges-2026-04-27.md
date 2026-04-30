---
title: "Azure Infrastructure Provisioning — Spec Challenges"
ticket: PLATFORM-1
slug: provision-azure-infra
spec: specs/provision-azure-infra-spec-2026-04-27.md
date: 2026-04-27
tags: [ai/generated, jira/spec-review]
---

# Azure Infrastructure Provisioning — Spec Challenges

> [!done] All items addressed.

Developer reviewer assessed the spec against the codebase. No other reviewer roles triggered.

## Ready to Fix in Spec

- [x] **1. Backend excludes managed identity at runtime (developer)**
  The backend's `DefaultAzureCredential` is instantiated with `excludeManagedIdentityCredential: true`. The provisioned system-assigned managed identity will never be used — the app will fall back to credential sources (Azure CLI, VS Code) that don't exist inside an App Service container. The spec must document that this flag must be removed before the managed identity path is functional, or note it as a known code change required before the infrastructure is useful.

- [x] **2. `AppRegistrationTenantId` missing from Key Vault secret list (developer)**
  The frontend's NextAuth.js configuration constructs the issuer URL from `process.env.AppRegistrationTenantId`. The spec notes the personal-account tenant concern but does not include this variable in the Key Vault secret inventory. Personal Microsoft accounts require either `common` or the consumer tenant ID (`9188040d-6c67-4c5b-b112-36a304b66dad`) — using the wrong value breaks token validation. The correct value should be resolved and included in the provisioning steps.

- [x] **3. `NEXTAUTH_URL` and `NEXT_PUBLIC_API_URL` absent from secret inventory (developer)**
  `NEXTAUTH_URL` is required by NextAuth.js for callback URL construction; `NEXT_PUBLIC_API_URL` controls where the frontend calls the backend. Both are environment-specific values that contain App Service hostnames that don't exist until provisioning is complete. Neither appears in the spec's Key Vault secret list. The spec must clarify how these are handled — as Key Vault secrets populated after App Service creation, or as App Service application settings set directly.

- [x] **4. `FRONTEND_ORIGIN` unaccounted for (developer)**
  The backend reads `process.env.FRONTEND_ORIGIN` to configure CORS allowed origins. In a deployed two-app setup this must be set to the frontend App Service URL or all browser requests will be blocked. It does not appear in the Key Vault secrets or anywhere in the provisioning steps. Like `NEXTAUTH_URL`, this value depends on the frontend hostname and must be provisioned after App Service creation.

## Process Note

Spec reviewed by one developer agent on 2026-04-27. Inline self-review passed with no items. All four items above were surfaced by the developer reviewer.

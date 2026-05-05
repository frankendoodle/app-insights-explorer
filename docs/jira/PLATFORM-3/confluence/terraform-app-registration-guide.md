# Terraform App Registration Guide

> Source: https://marcusmillichap.atlassian.net/wiki/spaces/~7120203dd1f49251f846a493c23ad3840a6094/pages/1895268417
> Author: Terhune, Stephen
> Last Modified: Apr 03, 2026

This guide covers how to add and manage Azure AD app registrations using the Terraform structure established in the Operations repos. It is intended as a practical reference for engineers who need to onboard a new service or application into the platform's identity infrastructure.

---

## Overview

App registrations and their associated service principals are managed as infrastructure code across two repos:

* `terraform-modules` — contains a reusable `aad_app_registration` module at `modules/aad_app_registration/`. This encapsulates the full set of Azure AD resources (application, service principal, app roles, API permissions, client secret, and Key Vault secret storage) behind a consistent interface.
* `inf-azuread-appregistration` — is the live Terraform root module that manages all ~50 app registrations in the platform. It consumes the module above, holds all environment-specific configuration, and is wired to an Azure DevOps pipeline for deployment.

Changes to existing app registrations and the addition of new ones are made exclusively in `inf-azuread-appregistration`. Changes to the module itself are made in `terraform-modules` and consumed via version references.

### What gets created per app registration

Each app registration provisions six Azure resources:

| Resource | Purpose |
| --- | --- |
| `azuread_application` | Core app registration object with display name and identifier URIs |
| `azuread_service_principal` | Service principal bound to the application |
| `azuread_application_app_role` | One or more custom app roles with pre-assigned GUIDs |
| `azuread_application_api_access` | API permission grants (e.g., Microsoft Graph scopes) |
| `azuread_application_password` | Client secret with a 700-day rotating lifecycle |
| `azurerm_key_vault_secret` | Stores `tenant_id`, `client_id`, and `client_secret` in Key Vault |

---

## Prerequisites

### Provider versions

```hcl
terraform {
  required_version = ">= 1.9.5"

  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = ">= 2.39.0, < 3.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 3.0, < 5.0"
    }
  }
}
```

---

## Step-by-Step: Adding a New App Registration

### Step 1 — Pre-generate all GUIDs

GUIDs must be stable across environments — the same role in `test`, `staging`, and `production` uses the same GUID. Generate them once and commit them. Never let Terraform generate them at apply time.

### Step 2 — Create the `.tf` file

```hcl
module "my_new_service" {
  source = "git::https://dev.azure.com/your-org/terraform-modules//modules/aad_app_registration?ref=vX.Y.Z"

  display_name     = lower("${var.environment}-my-new-service")
  identifier_uris  = var.identifier_uris["my-new-service"]
  ...
}
```

Note: add `lifecycle` block to prevent Terraform from reverting portal-applied consent grants:

```hcl
lifecycle {
  ignore_changes = [
    required_resource_access,
    app_role,
  ]
}
```

---

## Key Patterns

### Naming

App display names are always lowercased and environment-prefixed:

```hcl
display_name = lower("${var.environment}-my-new-service")
```

### Lifecycle — `ignore_changes`

The `lifecycle { ignore_changes = [required_resource_access, app_role] }` block on `azuread_application` is mandatory. Terraform cannot replicate the consent grant itself — `ignore_changes` keeps Terraform from conflating the declaration with the portal consent action.

### Secret rotation

Client secrets use a `time_rotating` resource with a 700-day cycle. Applications must read their client secret from Key Vault at runtime.

### GUID stability

App role GUIDs must be identical across all environments for the same logical role/scope. Never change a GUID after the app role has been assigned — it's destructive.

---

## Common Pitfalls

- GUIDs not pre-generated → plan-time error
- Missing `lifecycle { ignore_changes }` → pipeline strips portal consent grants
- Declaring API permissions ≠ granting them (admin consent still required via portal)
- Different GUIDs per environment → role assignments break in at least one env
- Manual portal changes cause state drift → Terraform will revert on next apply

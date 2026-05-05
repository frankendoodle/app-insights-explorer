# Q&A — Terraform App Registration Guide

> Source: https://marcusmillichap.atlassian.net/wiki/spaces/~7120203dd1f49251f846a493c23ad3840a6094/pages/1894645810
> Author: Terhune, Stephen
> Last Modified: Apr 03, 2026

Common questions about the Terraform App Registration Guide.

---

## Is a module required to create an app registration?

**Yes (per the guide), but No (per the actual codebase).**

The guide describes a module-based approach, but the actual configs in `inf-azuread-appregistration` use direct `azuread_*` resources — zero of the ~50 configs invoke a module block.

---

## What is the minimum app registration definition that Ops would approve?

The minimum is two direct resources:

```hcl
resource "azuread_application" "{name}" {
  display_name = lower("${var.environment}-{name}")

  lifecycle {
    ignore_changes = [required_resource_access, app_role, optional_claims]
  }
}

resource "azuread_service_principal" "{name}" {
  client_id = azuread_application.{name}.client_id
}
```

Three elements are non-negotiable in every file:

1. `display_name` — must follow `lower("${var.environment}-{name}")`. Never hardcoded, always environment-prefixed and lowercased.
2. `lifecycle { ignore_changes = [required_resource_access, app_role, optional_claims] }` on the `azuread_application`.
3. `azuread_service_principal` bound to the app via `client_id` — always present alongside the application.

`identifier_uris` is added only when the app exposes an API consumed by other services. It is absent from simpler registrations.

---

## What is an Azure service principal?

An Azure service principal is the identity that an application uses to authenticate and act within Azure AD.

* **App registration** (`azuread_application`) — the definition / blueprint. Declares what the app is, what permissions it needs, what redirect URIs it has.
* **Service principal** (`azuread_service_principal`) — the instance / deployed actor. This is the actual security object that gets assigned roles, granted API permissions, and used for authentication.

Every app registration automatically gets a service principal in its home tenant when created in the portal. In Terraform, they are separate resources — the ops pattern always pairs them explicitly.

Role assignments, API permission grants, and group memberships are all attached to the service principal — not the app registration itself.

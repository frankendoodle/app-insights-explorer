---
title: "Azure Infrastructure Provisioning — Implementation Plan"
ticket: PLATFORM-1
slug: provision-azure-infra
spec: specs/provision-azure-infra-spec-2026-04-27.md
date: 2026-04-28
status: complete
slot: 1
depends_on: []
testing_strategy: manual
implement_subtask: PLATFORM-260
tasks:
  - id: task-01
    title: "Create resource group rg-app-insights-explorer-test-2"
    jira_subtask: PLATFORM-199
    status: complete
  - id: task-02
    title: "Create Azure Container Registry acrappinsightstest2 (Basic)"
    jira_subtask: PLATFORM-200
    status: complete
  - id: task-03
    title: "Create App Service Plan asp-aie-test-2 (B1, Linux)"
    jira_subtask: PLATFORM-201
    status: complete
  - id: task-04
    title: "Create frontend Web App aie-web-test-2 (Linux, Docker)"
    jira_subtask: PLATFORM-202
    status: complete
  - id: task-05
    title: "Create API Web App aie-api-test-2 (Linux, Docker)"
    jira_subtask: PLATFORM-203
    status: complete
  - id: task-06
    title: "Create Key Vault kv-aie-test-2 (Standard, RBAC)"
    jira_subtask: PLATFORM-204
    status: complete
  - id: task-07
    title: "Enable system-assigned managed identity on both App Services"
    jira_subtask: PLATFORM-205
    status: complete
  - id: task-08
    title: "Assign AcrPull role to App Service managed identities"
    jira_subtask: PLATFORM-206
    status: complete
  - id: task-09
    title: "Assign Key Vault Secrets User role to App Service managed identities"
    jira_subtask: PLATFORM-207
    status: complete
  - id: task-10
    title: "Create SSO App Registration app-insights-explorer-sso-2"
    jira_subtask: PLATFORM-208
    status: complete
  - id: task-11
    title: "Create CI/CD App Registration and Service Principal sp-app-insights-explorer-cicd-2"
    jira_subtask: PLATFORM-208
    status: complete
  - id: task-12
    title: "Create OIDC federated identity credential for GitHub Actions"
    jira_subtask: PLATFORM-209
    status: complete
  - id: task-13
    title: "Assign Contributor and AcrPush roles to CI/CD Service Principal"
    jira_subtask: PLATFORM-210
    status: complete
  - id: task-14
    title: "Populate Key Vault with application secrets"
    jira_subtask: PLATFORM-211
    status: complete
  - id: task-15
    title: "Configure App Service application settings"
    jira_subtask: null
    status: complete
---

# Azure Infrastructure Provisioning — Implementation Plan

This plan walks through creating all Azure infrastructure for `app-insights-explorer` in the `test`
environment, one resource at a time. Each task explains what the resource is, why it exists, and
what you are doing when you run the commands — so you leave with a mental model, not just a list of
CLI calls.

**Testing strategy:** Manual verification — run the Azure CLI command, then run the verification
command to confirm the resource exists with the right configuration.

**Prerequisites before starting:**
- Azure CLI installed and up to date (`az --version`)
- Logged in to your personal Microsoft account (`az login`)
- Correct subscription is active (`az account show` — confirm the subscription name)
- GitHub repository `frankendoodle/app-insights-explorer` exists

**Resource name reference:**

| Resource | Name |
|---|---|
| Resource group | `rg-app-insights-explorer-test-2` |
| Container Registry | `acrappinsightstest2` |
| App Service Plan | `asp-aie-test-2` |
| Frontend Web App | `aie-web-test-2` |
| API Web App | `aie-api-test-2` |
| Key Vault | `kv-aie-test-2` |
| SSO App Registration | `app-insights-explorer-sso-2` |
| CI/CD App Registration | `sp-app-insights-explorer-cicd-2` |
| Region | `westus2` |

---

## Task 01 — Create resource group `rg-app-insights-explorer-test-2`

**Jira subtask:** PLATFORM-199

**Why this exists:**
A resource group is Azure's way of bundling related resources together. Everything you create for
this environment — the App Services, the container registry, the Key Vault — will live inside this
single group. That makes it easy to see all the resources at once, apply consistent tags, and
(eventually) delete the entire environment by deleting the group. The name follows the Azure
convention: `rg-` prefix, a meaningful descriptive name, and the environment suffix `-test`.

**Command:**
```bash
az group create \
  --name rg-app-insights-explorer-test-2 \
  --location westus2
```

**Verify:**
```bash
az group show \
  --name rg-app-insights-explorer-test-2 \
  --query "{name:name, location:location, state:properties.provisioningState}"
```

Expected output: `"state": "Succeeded"`, `"location": "westus2"`.

---

## Task 02 — Create Azure Container Registry `acrappinsightstest2` (Basic SKU)

**Jira subtask:** PLATFORM-200

**Why this exists:**
Your two Docker containers (frontend and API) need somewhere to live after they are built. Azure
Container Registry (ACR) is a private Docker image registry — think of it as your own private
Docker Hub. When GitHub Actions builds a new image, it pushes it here. When the App Services start,
they pull from here. The name must be globally unique across all of Azure and contain only lowercase
alphanumeric characters (no hyphens). Basic SKU is the cheapest tier and is sufficient for a
low-traffic proof of concept.

> **Note:** If `acrappinsightstest2` is already taken by another Azure account, append a short
> unique suffix (e.g. `acrappinsightstest22`). ACR names are a global namespace.

**Command:**
```bash
az acr create \
  --name acrappinsightstest2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --sku Basic \
  --location westus2
```

**Verify:**
```bash
az acr show \
  --name acrappinsightstest2 \
  --query "{name:name, sku:sku.name, loginServer:loginServer, adminEnabled:adminUserEnabled}"
```

Expected output: `"sku": "Basic"`, `"loginServer": "acrappinsightstest2.azurecr.io"`.
Note the `loginServer` value — you will reference it when configuring the App Services.

---

## Task 03 — Create App Service Plan `asp-aie-test-2` (B1, Linux)

**Jira subtask:** PLATFORM-201

**Why this exists:**
An App Service Plan defines the compute resources — CPU, memory, and operating system — that your
App Services share. You can think of it as renting a server: the plan is the server, and the App
Services are the applications running on it. Both the frontend and API web apps will run on this
single plan, which keeps costs low for a single-user POC.

**SKU: B1, not F1.** The free tier (F1) does not support Linux Docker containers. F1 is fine for
Windows .NET apps or Linux code deployments, but as soon as you want to run your own Docker image,
Azure requires at least the Basic B1 tier. B1 costs roughly $13/month. This is the minimum paid
tier and the appropriate choice here.

**Command:**
```bash
az appservice plan create \
  --name asp-aie-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --sku B1 \
  --is-linux \
  --location westus2
```

**Verify:**
```bash
az appservice plan show \
  --name asp-aie-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query "{name:name, sku:sku.name, kind:kind, numberOfSites:numberOfSites}"
```

Expected output: `"sku": "B1"`, `"kind": "linux"`.

---

## Task 04 — Create frontend Web App `aie-web-test-2` (Linux, Docker)

**Jira subtask:** PLATFORM-202

**Why this exists:**
An App Service web app is the actual running application — the thing that has a URL and responds to
HTTP requests. This one hosts the Next.js frontend. It is assigned to the App Service Plan you just
created. At creation time, you specify a placeholder container image (`nginx:latest`) so Azure has
something to deploy; you will replace it with the real image when CI/CD is working (a later story).

The app name `aie-web-test-2` becomes part of the public URL:
`https://aie-web-test-2.azurewebsites.net`. This URL must be globally unique across Azure.

`WEBSITES_PORT=3000` tells Azure which port inside the container to route traffic to. Next.js
listens on port 3000 by default.

**Command:**
```bash
az webapp create \
  --name aie-web-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --plan asp-aie-test-2 \
  --deployment-container-image-name "nginx:latest"
```

**Verify:**
```bash
az webapp show \
  --name aie-web-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query "{name:name, state:state, defaultHostName:defaultHostName, kind:kind}"
```

Expected output: `"state": "Running"`, `"defaultHostName": "aie-web-test-2.azurewebsites.net"`,
`"kind": "app,linux,container"`.

---

## Task 05 — Create API Web App `aie-api-test-2` (Linux, Docker)

**Jira subtask:** PLATFORM-203

**Why this exists:**
Same reasoning as Task 04 — this is the second App Service, hosting the NestJS API backend. It
runs on the same App Service Plan as the frontend (both containers share the B1 compute). The API
listens on port 3001, so `WEBSITES_PORT=3001` is the correct setting for this app.

**Command:**
```bash
az webapp create \
  --name aie-api-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --plan asp-aie-test-2 \
  --deployment-container-image-name "nginx:latest"
```

**Verify:**
```bash
az webapp show \
  --name aie-api-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query "{name:name, state:state, defaultHostName:defaultHostName, kind:kind}"
```

Expected output: `"state": "Running"`, `"defaultHostName": "aie-api-test-2.azurewebsites.net"`.

---

## Task 06 — Create Key Vault `kv-aie-test-2` (Standard SKU, RBAC authorization)

**Jira subtask:** PLATFORM-204

**Why this exists:**
Application secrets — OAuth client IDs and secrets, API keys, encryption keys — must not be stored
in environment variables checked into source control or set as plaintext App Service settings. Key
Vault is Azure's dedicated secrets store. At runtime, each App Service uses its managed identity
(created in Task 07) to read the secrets it needs directly from the vault.

Two important flags:
- `--sku standard`: There is no free Key Vault tier. Standard is the minimum available and incurs a
  small per-operation charge (typically cents per month for a low-traffic app).
- `--enable-rbac-authorization true`: By default, Key Vault uses "vault access policies" (an older
  model). RBAC authorization uses standard Azure role assignments instead — the same model used for
  ACR and resource group permissions. It is simpler to reason about and manage consistently.

**Command:**
```bash
az keyvault create \
  --name kv-aie-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --location westus2 \
  --sku standard \
  --enable-rbac-authorization true
```

**Verify:**
```bash
az keyvault show \
  --name kv-aie-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query "{name:name, sku:properties.sku.name, enableRbacAuthorization:properties.enableRbacAuthorization, uri:properties.vaultUri}"
```

Expected output: `"sku": "standard"`, `"enableRbacAuthorization": true`.
Note the `uri` value (e.g. `https://kv-aie-test-2.vault.azure.net/`) — referenced in Key Vault
reference syntax in Task 15.

---

## Task 07 — Enable system-assigned managed identity on both App Services

**Jira subtask:** PLATFORM-205

**Why this exists:**
A managed identity is like a service account for an Azure resource. When enabled, Azure creates an
identity in Entra ID and links it permanently to the App Service. The App Service can then prove
who it is to other Azure services (ACR, Key Vault) without storing any credentials. This is the
Azure-recommended way to handle credential-free inter-service authentication.

"System-assigned" means the identity is tied to the App Service's lifecycle — if you delete the
App Service, the identity is deleted too. This is the right choice for a straightforward setup
where identities are not shared across resources.

You need the `principalId` of each identity for the role assignments in Tasks 08 and 09. Capture
those values after running the commands below.

**Commands:**
```bash
az webapp identity assign \
  --name aie-web-test-2 \
  --resource-group rg-app-insights-explorer-test-2

az webapp identity assign \
  --name aie-api-test-2 \
  --resource-group rg-app-insights-explorer-test-2
```

**Capture the principal IDs** (you will need these in Tasks 08 and 09):
```bash
WEB_IDENTITY=$(az webapp identity show \
  --name aie-web-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query principalId \
  --output tsv)

API_IDENTITY=$(az webapp identity show \
  --name aie-api-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query principalId \
  --output tsv)

echo "Frontend principal ID: $WEB_IDENTITY"
echo "API principal ID: $API_IDENTITY"
```

**Verify:**
```bash
az webapp identity show \
  --name aie-web-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query "{type:type, principalId:principalId, tenantId:tenantId}"

az webapp identity show \
  --name aie-api-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query "{type:type, principalId:principalId, tenantId:tenantId}"
```

Expected output for both: `"type": "SystemAssigned"` and a non-empty `principalId` GUID.

---

## Task 08 — Assign AcrPull role to App Service managed identities

**Jira subtask:** PLATFORM-206

**Why this exists:**
Managed identities are powerful but they start with zero permissions — you have to explicitly grant
each one only the access it needs. The `AcrPull` role on the ACR resource allows the App Service to
pull Docker images from the registry. Without this, the App Service cannot start the container.

Scoping the role to the specific ACR resource (rather than the whole subscription) means a
compromised App Service can only pull images — it cannot push images, create new repositories, or
touch anything else in the subscription.

**Commands** (assumes `$WEB_IDENTITY` and `$API_IDENTITY` are still set from Task 07):
```bash
ACR_ID=$(az acr show \
  --name acrappinsightstest2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query id \
  --output tsv)

echo $ACR_ID

az role assignment create \
  --assignee-object-id "$WEB_IDENTITY" \
  --assignee-principal-type ServicePrincipal \
  --role AcrPull \
  --scope "$ACR_ID"

az role assignment create \
  --assignee-object-id "$API_IDENTITY" \
  --assignee-principal-type ServicePrincipal \
  --role AcrPull \
  --scope "$ACR_ID"
```

**Verify:**
```bash
az role assignment list \
  --scope "$ACR_ID" \
  --query "[?roleDefinitionName=='AcrPull'].{principal:principalName, role:roleDefinitionName}"
```

Expected output: two entries, one for each App Service managed identity.

---

## Task 09 — Assign Key Vault Secrets User role to App Service managed identities

**Jira subtask:** PLATFORM-207

**Why this exists:**
The `Key Vault Secrets User` role allows a principal to read individual secret values but not list
secret names, manage the vault, or read certificates/keys. This is intentionally narrow — if an
App Service is compromised, the attacker cannot enumerate the vault's full contents, only read the
secrets the app is already configured to fetch by name.

This task also grants you (`Key Vault Secrets Officer`) permission to write secrets in Task 14.
Without this, your CLI commands in Task 14 will be denied even though you own the subscription,
because RBAC authorization is enabled on the vault.

**Commands** (assumes `$WEB_IDENTITY` and `$API_IDENTITY` are still set from Task 07):
```bash
KV_ID=$(az keyvault show \
  --name kv-aie-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query id \
  --output tsv)

# Grant the frontend App Service identity read access to secrets
az role assignment create \
  --assignee-object-id "$WEB_IDENTITY" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$KV_ID"

# Grant the API App Service identity read access to secrets
az role assignment create \
  --assignee-object-id "$API_IDENTITY" \
  --assignee-principal-type ServicePrincipal \
  --role "Key Vault Secrets User" \
  --scope "$KV_ID"

# Grant your own account write access so you can populate secrets in Task 14
ADMIN_OBJECT_ID=$(az ad signed-in-user show --query id --output tsv)

az role assignment create \
  --assignee-object-id "$ADMIN_OBJECT_ID" \
  --assignee-principal-type User \
  --role "Key Vault Secrets Officer" \
  --scope "$KV_ID"
```

**Verify:**
```bash
az role assignment list \
  --scope "$KV_ID" \
  --query "[].{principal:principalName, role:roleDefinitionName}"
```

Expected output: three entries — two `Key Vault Secrets User` (App Services) and one
`Key Vault Secrets Officer` (your account).

---

## Task 10 — Create SSO App Registration `app-insights-explorer-sso-2`

**Jira subtask:** PLATFORM-208 (first of two)

**Why this exists:**
NextAuth.js needs an Entra ID (Azure AD) application to handle the OAuth/OIDC login flow for the
frontend. When a user clicks "Sign in", the browser redirects to Microsoft's login page. Microsoft
validates the user and sends back a token to the redirect URI you register here. The App
Registration is the record in Entra ID that establishes trust between Microsoft's auth system and
your application.

`AzureADandPersonalMicrosoftAccount` is the sign-in audience for the `common` authority endpoint,
which accepts personal Microsoft accounts (the developer's Yahoo/Microsoft account). Without this,
login would fail for personal accounts.

The redirect URI must exactly match the URL NextAuth.js uses in the callback. For App Service, the
callback URL is `https://{hostname}/api/auth/callback/azure-ad`.

**Commands:**
```bash
# Create the App Registration
az ad app create \
  --display-name "app-insights-explorer-sso-2" \
  --sign-in-audience AzureADandPersonalMicrosoftAccount \
  --web-redirect-uris "https://aie-web-test-2.azurewebsites.net/api/auth/callback/azure-ad"

# Capture the App (client) ID — needed for Key Vault secrets in Task 14
SSO_APP_ID=$(az ad app list \
  --display-name "app-insights-explorer-sso-2" \
  --query "[0].appId" \
  --output tsv)

echo "SSO App Client ID: $SSO_APP_ID"

# Create a client secret — capture the value immediately, it is shown only once
az ad app credential reset \
  --id "$SSO_APP_ID" \
  --display-name "app-insights-explorer-sso-2-secret" \
  --years 2 \
  --append
```

> **Important:** The `az ad app credential reset` output includes `"password": "..."`. Copy this
> value and store it somewhere safe (a local password manager or directly into Key Vault in
> Task 14). It cannot be retrieved again after this command completes.

**Verify:**
```bash
az ad app show \
  --id "$SSO_APP_ID" \
  --query "{displayName:displayName, appId:appId, signInAudience:signInAudience, redirectUris:web.redirectUris}"
```

Expected output: `"signInAudience": "AzureADandPersonalMicrosoftAccount"`, redirect URI matches
`https://aie-web-test-2.azurewebsites.net/api/auth/callback/azure-ad`.

---

## Task 11 — Create CI/CD App Registration and Service Principal `sp-app-insights-explorer-cicd-2`

**Jira subtask:** PLATFORM-208 (second of two)

**Why this exists:**
GitHub Actions needs permission to push Docker images to ACR and run Terraform against your Azure
subscription. The way Azure grants this is through a Service Principal — an application identity
that can hold role assignments and be impersonated by external systems.

A Service Principal consists of two objects: an **App Registration** (the application definition)
and a **Service Principal** (the identity that gets role assignments). You create both here.

This registration does not need redirect URIs, client secrets, or a sign-in audience — it is not
used for user authentication. It exists solely so that GitHub Actions can prove its identity to
Azure via OIDC (added in Task 12) and receive a short-lived access token.

> **Do not create a client secret for this App Registration.** You will use an OIDC federated
> credential instead (Task 12). A stored client secret would need rotation; OIDC tokens are
> short-lived and need no secret management.

**Commands:**
```bash
# Create the App Registration
az ad app create \
  --display-name "sp-app-insights-explorer-cicd-2"

# Capture the App (client) ID
CICD_APP_ID=$(az ad app list \
  --display-name "sp-app-insights-explorer-cicd-2" \
  --query "[0].appId" \
  --output tsv)

# Create the Service Principal from the App Registration
az ad sp create --id "$CICD_APP_ID"

# Capture the Service Principal's Object ID (distinct from the App ID)
CICD_SP_OBJECT_ID=$(az ad sp show \
  --id "$CICD_APP_ID" \
  --query id \
  --output tsv)

echo "CI/CD App (client) ID: $CICD_APP_ID"
echo "CI/CD Service Principal Object ID: $CICD_SP_OBJECT_ID"
```

> **Save both values.** You will need `$CICD_APP_ID` to configure the OIDC credential in Task 12
> and as a GitHub Actions variable. You will need `$CICD_SP_OBJECT_ID` for role assignments in
> Task 13.

**Verify:**
```bash
az ad sp show \
  --id "$CICD_APP_ID" \
  --query "{displayName:displayName, appId:appId, id:id, servicePrincipalType:servicePrincipalType}"
```

Expected output: `"servicePrincipalType": "Application"`, both `appId` and `id` are non-empty GUIDs.

---

## Task 12 — Create OIDC federated identity credential for GitHub Actions

**Jira subtask:** PLATFORM-209

**Why this exists:**
An OIDC federated identity credential tells Azure: "I trust GitHub Actions pipelines from this
specific repository and branch to prove their identity as this App Registration." When a workflow
runs, GitHub generates a short-lived signed token. Azure verifies the token against GitHub's OIDC
provider and exchanges it for an Azure access token. No Azure secret ever touches GitHub's secrets
store.

The `subject` field is the exact claim GitHub includes in its OIDC token. The format is:
`repo:{owner}/{repo}:ref:refs/heads/{branch}`. This scope means only pushes to the `development`
branch can authenticate — pull requests, other branches, and forks cannot.

**Command:**
```bash
az ad app federated-credential create \
  --id "$CICD_APP_ID" \
  --parameters '{
    "name": "github-ci",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:frankendoodle/app-insights-explorer:ref:refs/heads/development",
    "description": "GitHub Actions CI on the development branch",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

**Verify:**
```bash
az ad app federated-credential list \
  --id "$CICD_APP_ID" \
  --query "[].{name:name, subject:subject, issuer:issuer}"
```

Expected output: one entry with `"subject": "repo:frankendoodle/app-insights-explorer:ref:refs/heads/development"`.

---

## Task 13 — Assign Contributor and AcrPush roles to CI/CD Service Principal

**Jira subtask:** PLATFORM-210

**Why this exists:**
The CI/CD Service Principal needs two roles:

- **Contributor on the subscription**: Allows `terraform apply` to create and manage resources
  within the subscription. This is intentionally broad — Terraform needs to be able to create and
  configure any resource type. For a personal POC with a single subscription, this is acceptable.
- **AcrPush on ACR**: Allows GitHub Actions to push Docker images built in the CI pipeline to the
  registry. Scoping this to the ACR resource (not the subscription) means the pipeline can only
  push images, not manage other registry resources.

**Commands** (assumes `$CICD_SP_OBJECT_ID` is set from Task 11):
```bash
SUB_ID=$(az account show --query id --output tsv)

ACR_ID=$(az acr show \
  --name acrappinsightstest2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query id \
  --output tsv)

echo $ACR_ID

# Contributor at the subscription scope — for terraform apply
az role assignment create \
  --assignee-object-id "$CICD_SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role Contributor \
  --scope "/subscriptions/$SUB_ID"

# AcrPush at the ACR scope — for Docker image pushes
az role assignment create \
  --assignee-object-id "$CICD_SP_OBJECT_ID" \
  --assignee-principal-type ServicePrincipal \
  --role AcrPush \
  --scope "$ACR_ID"
```

**Verify:**
```bash
# Check subscription-level assignment
az role assignment list \
  --assignee "$CICD_SP_OBJECT_ID" \
  --scope "/subscriptions/$SUB_ID" \
  --query "[?roleDefinitionName=='Contributor'].{role:roleDefinitionName, scope:scope}"

# Check ACR-level assignment
az role assignment list \
  --assignee "$CICD_SP_OBJECT_ID" \
  --scope "$ACR_ID" \
  --query "[?roleDefinitionName=='AcrPush'].{role:roleDefinitionName, scope:scope}"
```

Expected output: one Contributor entry at subscription scope, one AcrPush entry at ACR scope.

---

## Task 14 — Populate Key Vault with application secrets

**Jira subtask:** PLATFORM-211

**Why this exists:**
Before the applications can start, Key Vault must contain the secrets they will read at startup.
The App Services are configured in Task 15 to reference these secrets by name — if a secret is
missing, the App Service will fail to start.

You will need the following values before running these commands:

| Secret name | Where to find it |
|---|---|
| `AppRegistrationClientId` | The `$SSO_APP_ID` captured in Task 10 |
| `AppRegistrationClientSecret` | The `"password"` from `az ad app credential reset` in Task 10 |
| `AnthropicApiKey` | Your Anthropic account dashboard |
| `BackendApiSecret` | Generate: `openssl rand -hex 32` |
| `NextAuthSecret` | Generate: `openssl rand -hex 32` |

> **Generate your random secrets before running the commands below.** You can run
> `openssl rand -hex 32` twice to get two different values — one for `BackendApiSecret` and one
> for `NextAuthSecret`.

**Commands:**
```bash
# Set each of the five secrets — replace the placeholder values with real values
az keyvault secret set \
  --vault-name kv-aie-test-2 \
  --name AppRegistrationClientId \
  --value "<SSO_APP_ID from Task 10>"

az keyvault secret set \
  --vault-name kv-aie-test-2 \
  --name AppRegistrationClientSecret \
  --value "<client secret from Task 10>"

az keyvault secret set \
  --vault-name kv-aie-test-2 \
  --name AnthropicApiKey \
  --value "<your Anthropic API key>"

az keyvault secret set \
  --vault-name kv-aie-test-2 \
  --name BackendApiSecret \
  --value "<output of: openssl rand -hex 32>"

az keyvault secret set \
  --vault-name kv-aie-test-2 \
  --name NextAuthSecret \
  --value "<output of: openssl rand -hex 32>"
```

**Verify:**
```bash
az keyvault secret list \
  --vault-name kv-aie-test-2 \
  --query "[].{name:name, enabled:attributes.enabled}"
```

Expected output: five secrets, all with `"enabled": true`.

To confirm a specific secret is readable (substitute any secret name):
```bash
az keyvault secret show \
  --vault-name kv-aie-test-2 \
  --name AppRegistrationClientId \
  --query "{name:name, value:value}"
```

---

## Task 15 — Configure App Service application settings

**Jira subtask:** (none — covers spec section 4 App Service application settings)

**Why this exists:**
App Services read configuration from "application settings" — key/value pairs that become
environment variables inside the running container. Some of these values are sensitive secrets
stored in Key Vault (referenced via the `@Microsoft.KeyVault(...)` syntax). Others are
non-sensitive, environment-specific values set directly.

The Key Vault reference syntax `@Microsoft.KeyVault(VaultName=...;SecretName=...)` tells App
Service to fetch the secret from Key Vault at startup using the managed identity you configured in
Tasks 07 and 09. If the managed identity does not have the `Key Vault Secrets User` role, startup
will fail with a permissions error.

`WEBSITES_PORT` tells Azure which port the container listens on. Next.js defaults to 3000;
NestJS defaults to 3001. Without this, Azure routes traffic to port 80 and the app never responds.

`WEBSITES_ENABLE_APP_SERVICE_STORAGE = false` disables persistent storage mounting, which is
correct for stateless Docker containers.

**Frontend App Service (`aie-web-test-2`) settings:**
```bash
az webapp config appsettings set \
  --name aie-web-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --settings \
    "WEBSITES_PORT=3000" \
    "WEBSITES_ENABLE_APP_SERVICE_STORAGE=false" \
    "AppRegistrationClientId=@Microsoft.KeyVault(VaultName=kv-aie-test-2;SecretName=AppRegistrationClientId)" \
    "AppRegistrationClientSecret=@Microsoft.KeyVault(VaultName=kv-aie-test-2;SecretName=AppRegistrationClientSecret)" \
    "NextAuthSecret=@Microsoft.KeyVault(VaultName=kv-aie-test-2;SecretName=NextAuthSecret)" \
    "NEXT_PUBLIC_BACKEND_API_SECRET=@Microsoft.KeyVault(VaultName=kv-aie-test-2;SecretName=BackendApiSecret)" \
    "NEXTAUTH_URL=https://aie-web-test-2.azurewebsites.net" \
    "NEXT_PUBLIC_API_URL=https://aie-api-test-2.azurewebsites.net" \
    "AppRegistrationTenantId=consumers"
```

**API App Service (`aie-api-test-2`) settings:**
```bash
az webapp config appsettings set \
  --name aie-api-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --settings \
    "WEBSITES_PORT=3001" \
    "WEBSITES_ENABLE_APP_SERVICE_STORAGE=false" \
    "ANTHROPIC_API_KEY=@Microsoft.KeyVault(VaultName=kv-aie-test-2;SecretName=AnthropicApiKey)" \
    "BACKEND_API_SECRET=@Microsoft.KeyVault(VaultName=kv-aie-test-2;SecretName=BackendApiSecret)" \
    "FRONTEND_ORIGIN=https://aie-web-test-2.azurewebsites.net"
```

**Configure both App Services to pull from ACR using managed identity:**
```bash
# Frontend — point container config to ACR; managed identity handles authentication
az webapp config container set \
  --name aie-web-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --container-image-name "acrappinsightstest2.azurecr.io/app-insights-explorer-frontend:latest" \
  --container-registry-url "https://acrappinsightstest2.azurecr.io"

# API — same pattern
az webapp config container set \
  --name aie-api-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --container-image-name "acrappinsightstest2.azurecr.io/app-insights-explorer-api:latest" \
  --container-registry-url "https://acrappinsightstest2.azurecr.io"

# Enable managed identity for ACR authentication (no stored credentials)
az resource update \
  --resource-group rg-app-insights-explorer-test-2 \
  --resource-type "Microsoft.Web/sites" \
  --name aie-web-test-2 \
  --set properties.siteConfig.acrUseManagedIdentityCreds=true

az resource update \
  --resource-group rg-app-insights-explorer-test-2 \
  --resource-type "Microsoft.Web/sites" \
  --name aie-api-test-2 \
  --set properties.siteConfig.acrUseManagedIdentityCreds=true
```

**Verify all settings are present:**
```bash
az webapp config appsettings list \
  --name aie-web-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query "[].{name:name, value:value}"

az webapp config appsettings list \
  --name aie-api-test-2 \
  --resource-group rg-app-insights-explorer-test-2 \
  --query "[].{name:name, value:value}"
```

Expected output for the frontend: 9 settings including `NEXTAUTH_URL`, `NEXT_PUBLIC_API_URL`,
`AppRegistrationTenantId=consumers`, and Key Vault references for the sensitive secrets.

**Verify ACR container configuration:**
```bash
az webapp config container show \
  --name aie-web-test-2 \
  --resource-group rg-app-insights-explorer-test-2

az webapp config container show \
  --name aie-api-test-2 \
  --resource-group rg-app-insights-explorer-test-2
```

Expected output: container image set to `acrappinsightstest2.azurecr.io/...`,
`DOCKER_REGISTRY_SERVER_URL` = `https://acrappinsightstest2.azurecr.io`.

---

## Known Gap — Backend Code Change Required

> **Before the application can start successfully, one code change is required in the backend.**

The NestJS backend currently instantiates `DefaultAzureCredential` with
`excludeManagedIdentityCredential: true`. Inside an App Service container, Azure CLI and VS Code
auth (the fallback sources) do not exist — only the managed identity works. As written, the
credential chain will skip the managed identity and fail to authenticate to Azure services (App
Insights queries, etc.).

**Required fix:** Remove `excludeManagedIdentityCredential: true` from the
`DefaultAzureCredential` constructor options. This is a one-line change in the backend source.

This fix is out of scope for PLATFORM-1 (infrastructure provisioning) but is a blocker for the
application starting correctly after CI/CD deploys (PLATFORM-29). Address it before or alongside
the first deployment attempt.

---

## GitHub Actions Variables Required

After completing all 15 tasks, the following values need to be set as GitHub Actions variables or
secrets in the `frankendoodle/app-insights-explorer` repository for the CI/CD pipeline (PLATFORM-29):

| Variable/Secret | Value | Where |
|---|---|---|
| `AZURE_CLIENT_ID` | `$CICD_APP_ID` from Task 11 | GitHub Actions Variable |
| `AZURE_TENANT_ID` | Your subscription's tenant ID (`az account show --query tenantId -o tsv`) | GitHub Actions Variable |
| `AZURE_SUBSCRIPTION_ID` | Your subscription ID (`az account show --query id -o tsv`) | GitHub Actions Variable |
| `ACR_NAME` | `acrappinsightstest2` | GitHub Actions Variable |

No Azure secrets are stored in GitHub — authentication uses the OIDC federated credential created
in Task 12.

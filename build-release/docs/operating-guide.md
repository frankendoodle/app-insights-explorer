# App Insights Explorer — Operating Guide

**Audience:** Developers, Team Lead, QA, and Ops  
**Last updated:** 2026-04-03

---

## 1. How the Pipeline Works

There are three workflow files, each triggered by a different git event.

### `pr.yml` — Pull Request Checks
**Trigger:** Any PR targeting `development`

```
PR opened / updated
  ├── build-web    → npm ci, lint, docker build (not pushed)
  ├── build-api    → npm ci, lint, test, docker build (not pushed)
  └── terraform-plan (after both builds pass)
        → terraform init + plan against test environment
        → posts plan output as a PR comment
```

Purpose: validate that the code compiles, passes lint and tests, and that the infra change is safe — before anything is merged.

---

### `ci.yml` — Continuous Integration / Deploy to TEST
**Trigger:** Push to `development` (i.e. a PR is merged)

```
Merge to development
  ├── build-web    → npm ci, lint, docker build + push to ACR (tagged with git SHA)
  ├── build-api    → npm ci, lint, test, docker build + push to ACR
  └── terraform-apply-test (after both builds pass)
        → terraform apply → creates/updates TEST infra
        ├── deploy-api  → update container image on TEST api App Service, restart
        ├── deploy-web  → update container image on TEST web App Service, restart
        └── smoke-test  → GET /api/environments + GET / must return 200
```

A failed smoke test does not roll back automatically — it signals that the deploy completed but the app is unhealthy. Check logs.

---

### `release.yml` — Deploy to Staging + Production
**Trigger:** Push to a `release/*` branch

```
Push to release/YYYY-MM-DD
  ├── build-web    → build + push (same SHA tag; if already in ACR from CI, push is a no-op)
  ├── build-api    → build + push
  │
  ├── terraform-apply-staging → apply staging infra
  ├── deploy-api-staging      → update image, restart
  ├── deploy-web-staging      → update image, restart
  └── smoke-test-staging      → must pass before production can proceed
        │
        │  ⏸ PAUSED — awaits approval from QA, PM, and Team Lead
        │
        ├── terraform-apply-prod → apply prod infra
        ├── deploy-api-prod      → update image, restart
        ├── deploy-web-prod      → update image, restart
        └── smoke-test-prod      → final health check
```

**The same Docker image SHA that was deployed to TEST is promoted to Staging and then Production — it is never rebuilt.**

---

## 2. Day-to-Day Developer Workflow

```bash
# 1. Start from latest development
git checkout development
git pull origin development

# 2. Create a feature branch
git checkout -b fg/my-feature

# 3. Do the work, commit with the ticket key
git commit -m "CASC-123: implement my feature"

# 4. Push and open a PR targeting development
git push origin fg/my-feature
# → open PR in GitHub UI

# 5. Pipeline runs automatically (pr.yml)
#    - build-web, build-api, terraform-plan must all pass
#    - 1 peer review required before merge is allowed

# 6. Merge the PR
#    → ci.yml fires automatically
#    → TEST environment is updated within ~10 minutes
```

You do not need to do anything after merging. The pipeline handles the rest.

---

## 3. How to Create a Release

A release deploys a known-good state of `development` to Staging, and then (with approvals) to Production.

```bash
# 1. Make sure development is in the state you want to release
git checkout development
git pull origin development

# 2. Create a release branch — use today's date or a version label
git checkout -b release/2026-04-15
git push origin release/2026-04-15
```

This push triggers `release.yml` immediately. Staging deploys automatically. Watch progress at:

> GitHub repo → Actions → Release — Deploy to Staging + Production

---

## 4. How to Approve a Production Deployment

After Staging smoke tests pass, the pipeline pauses and waits for three approvals: **QA, PM, and Team Lead**.

1. Go to: GitHub repo → **Actions** → find the running `Release` workflow
2. Click into the workflow run — you will see a yellow "Waiting for approval" step on `terraform-apply-prod`
3. Click **Review deployments** → select the `production` environment → **Approve and deploy**

All three approvers must complete this step before production jobs begin. Approvals can be given in any order.

**To reject:** Click **Reject** instead. The workflow stops and no production change is made.

---

## 5. How to Add or Rotate a Secret

App secrets live in **Azure Key Vault**, not GitHub. The pipeline never sees or injects secret values.

**To update an existing secret:**
```bash
az keyvault secret set \
  --vault-name kv-aie-<env> \
  --name <SecretName> \
  --value "<new-value>"
```

Then restart the App Service to pick up the new value:
```bash
az webapp restart \
  --name aie-<web|api>-<env> \
  --resource-group rg-app-insights-explorer-<env>
```

App Service resolves Key Vault references on startup — no pipeline run required, no GitHub involvement.

**To add a new secret:**
1. Add the secret to Key Vault (command above)
2. Add the Key Vault reference to the app settings in `infra/modules/app-service/main.tf`
3. Open a PR — the `terraform-plan` step will show the new app setting in the plan output
4. Merge → CI applies the change to TEST automatically

**Key Vault names by environment:**

| Environment | Key Vault |
|---|---|
| test | `kv-aie-test` |
| staging | `kv-aie-staging` |
| production | `kv-aie-prod` |

---

## 6. How to Run Terraform Locally

Useful for inspecting planned changes before opening a PR.

```bash
# Prerequisites: Azure CLI installed and logged in
az login

# Navigate to the environment you want to inspect
cd infra/envs/test

# Init — pass the backend config manually (same values as the GitHub Variables)
terraform init \
  -backend-config="resource_group_name=<TF_BACKEND_RESOURCE_GROUP>" \
  -backend-config="storage_account_name=<TF_BACKEND_STORAGE_ACCOUNT>" \
  -backend-config="container_name=tfstate" \
  -backend-config="key=app-insights-explorer/test.tfstate"

# Plan — inspect what would change
terraform plan \
  -var="image_tag=local-dev" \
  -var="acr_name=<ACR_NAME>"
```

**Do not run `terraform apply` manually.** The pipeline is the only authorised path for applying infra changes. Manual applies bypass the PR review and approval process, and can create drift between the state file and what the pipeline expects.

---

## 7. Common Failures and Fixes

### Build fails — lint or test error
The workflow log shows which file and line failed.  
Fix locally, push to your branch. The PR checks re-run automatically.

### Terraform plan fails
Usually means there is drift between the Terraform code and the current state of Azure, or a syntax error in a `.tf` file.  
Read the plan error carefully. If it is drift (something was changed manually in the portal), investigate before deciding whether to reconcile in code or in Azure. Do not apply blindly.

### Deploy fails — App Service timeout
`az webapp wait` timed out. The app may have started but slowly, or it may have crashed on startup.  
Check logs: Azure Portal → App Service → **Log stream** or **Diagnose and solve problems**.  
Common causes: missing Key Vault secret (see Step 9a), misconfigured environment variable, app crash on boot.

### Smoke test fails — app started but unhealthy
The App Service is running but returning non-200 responses.  
Check application logs: Azure Portal → App Service → **Log stream**.  
If the API smoke test fails, check that all Key Vault secrets have been populated (run `az keyvault secret list --vault-name kv-aie-<env>` to verify).

### Key Vault reference resolution failure
App Service logs will show `Microsoft.KeyVault` resolution errors.  
Cause: either the secret does not exist in the Key Vault, or the App Service managed identity does not have `Key Vault Secrets User` on the vault.  
Fix: verify the secret exists (`az keyvault secret show --vault-name kv-aie-<env> --name <SecretName>`) and that Terraform has been applied (which sets the role assignment).

---

## 8. Branch Protection Rules (GitHub Configuration)

These rules are configured in GitHub, not in code. They must be set manually after the repo is created.

**`development` branch:**
- Require pull request before merging
- Required approvals: 1
- Dismiss stale reviews when new commits are pushed
- Require status checks: `Build Web`, `Build API`, `Terraform Plan (test)`
- Do not allow force pushes
- Do not allow deletion

**`release/*` branches:**
- Require pull request: Team Lead approval (1 required)
- Do not allow force pushes

**`main` branch:**
- No direct pushes — merge only via PR from release branch

To configure: GitHub repo → **Settings** → **Branches** → **Add branch protection rule**

---

## 9. Pre-Provisioning Checklist (First-Time Setup)

Before the pipeline can run end-to-end, an operator must complete these one-time steps. Each step is documented in detail in the spec (`PLATFORM-44-04-spec.md`).

- [ ] Terraform state storage account created (Step 5) — manual, cannot be Terraformed
- [ ] `infra/shared/` applied manually to provision the ACR (Step 6)
- [ ] Service Principal `sp-app-insights-explorer-cicd` created with OIDC federated credentials (Step 7)
- [ ] GitHub Variables configured: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `TF_BACKEND_RESOURCE_GROUP`, `TF_BACKEND_STORAGE_ACCOUNT`, `ACR_NAME` (Step 9)
- [ ] App Registration created in M&M tenant for SSO (Step 8)
- [ ] `terraform apply` run for each env to provision Key Vaults (Step 6)
- [ ] Key Vault secrets bootstrapped for each env (Step 9a)
- [ ] Branch protection rules configured (Step 11 / Section 8 above)

---

## 10. Ops Contact and Escalation

Escalate to Ops when:
- Azure subscription access or quota issues block infrastructure provisioning
- Network/firewall rules need to be updated for App Service outbound traffic
- ACR or Key Vault naming conflicts with org-wide naming standards
- A production incident requires changes outside the team's Azure RBAC scope

When escalating, provide:
- The GitHub Actions run URL (shows exact step and error)
- The Azure resource name and resource group
- The error message from the workflow log or Azure Portal

---
title: "GitHub Actions Reusable Deploy Workflow — Implementation Plan"
ticket: PLATFORM-457
slug: deploy-workflow
spec: specs/deploy-workflow-spec-2026-05-08.md
date: 2026-05-08
status: approved
implement_subtask: PLATFORM-464
validation_commands: []
---

# GitHub Actions Reusable Deploy Workflow — Implementation Plan

Implements the build-once / promote-by-SHA model: extracts the deploy logic from `ci-test.yml`
into a reusable `_deploy.yml` workflow, refactors `ci-test.yml` → `ci.yml` to call it for
the test environment, and adds `ci-release.yml` to promote the existing image SHA through
staging and production on push to a `release/**` branch.

## Task Summary

| # | Task | Who | Blocking dependency |
|---|---|---|---|
| 1 | Create `_deploy.yml` | Agent | — |
| 2 | Rename `ci-test.yml` → `ci.yml` | Agent | Task 1 committed |
| 3 | Create `ci-release.yml` | Agent | Task 1 committed |
| 4a | Add OIDC federated credentials (staging + production) | Agent (code) + Human (trigger) | Merge PR, then trigger `workflow_dispatch apply shared` |
| 4b | Create staging GitHub environment with Variables and Secrets | **Human** | `workflow_dispatch apply staging` completed |
| 4c | Create production GitHub environment with Variables, Secrets, reviewer | **Human** | `workflow_dispatch apply production` completed |
| 4d | End-to-end release verification | **Human** | 4a + 4b + 4c complete |

Tasks 1–3 and 4a are code changes that merge together. `ci-release.yml` will fail with a 401
until the merged `infra/shared/` Terraform is applied (which happens automatically on push to
`development`). It will deploy to non-existent resources until 4b/4c are done.

---

## Task 1 — [AGENT] Create `_deploy.yml` reusable workflow

**Files:** `.github/workflows/_deploy.yml` (new)

Create the reusable workflow. The `deploy` job declares `environment: ${{ inputs.environment }}`
so GitHub auto-resolves all environment-scoped Variables and Secrets. The resource group is
constructed inline from the environment name, matching the IaC naming convention.

```yaml
# .github/workflows/_deploy.yml
name: Deploy (reusable)

on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      sha:
        required: true
        type: string

permissions:
  id-token: write
  contents: read

env:
  IMAGE_FRONTEND: app-insights-explorer-frontend
  IMAGE_API: app-insights-explorer-api

jobs:
  deploy:
    name: Deploy to ${{ inputs.environment }}
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - name: Log in to Azure via OIDC
        uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

      - name: Deploy frontend to App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: ${{ vars.WEBAPP_FRONTEND }}
          images: ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_FRONTEND }}:${{ inputs.sha }}

      - name: Deploy API to App Service
        uses: azure/webapps-deploy@v3
        with:
          app-name: ${{ vars.WEBAPP_API }}
          images: ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_API }}:${{ inputs.sha }}

      - name: Populate Key Vault secrets
        run: |
          az keyvault secret set --vault-name "${{ vars.KV_NAME }}" --name "AppRegistrationClientId"     --value "${{ secrets.AZURE_AD_CLIENT_ID }}"      --output none
          az keyvault secret set --vault-name "${{ vars.KV_NAME }}" --name "AppRegistrationClientSecret" --value "${{ secrets.AZURE_AD_CLIENT_SECRET }}"   --output none
          az keyvault secret set --vault-name "${{ vars.KV_NAME }}" --name "AnthropicApiKey"             --value "${{ secrets.ANTHROPIC_API_KEY }}"         --output none
          az keyvault secret set --vault-name "${{ vars.KV_NAME }}" --name "BackendApiSecret"            --value "${{ secrets.BACKEND_API_SECRET }}"        --output none
          az keyvault secret set --vault-name "${{ vars.KV_NAME }}" --name "NextAuthSecret"              --value "${{ secrets.NEXTAUTH_SECRET }}"           --output none

      - name: Stop App Services
        run: |
          az webapp stop --name "${{ vars.WEBAPP_FRONTEND }}" --resource-group rg-app-insights-explorer-${{ inputs.environment }}-tfg
          az webapp stop --name "${{ vars.WEBAPP_API }}"      --resource-group rg-app-insights-explorer-${{ inputs.environment }}-tfg

      - name: Start App Services
        run: |
          az webapp start --name "${{ vars.WEBAPP_FRONTEND }}" --resource-group rg-app-insights-explorer-${{ inputs.environment }}-tfg
          az webapp start --name "${{ vars.WEBAPP_API }}"      --resource-group rg-app-insights-explorer-${{ inputs.environment }}-tfg

      - name: Wait for App Services to start
        run: sleep 60

      - name: Smoke test — API health check
        run: |
          curl --fail \
               --retry 5 \
               --retry-delay 15 \
               --retry-connrefused \
               --retry-all-errors \
               https://${{ vars.WEBAPP_API }}.azurewebsites.net/health

      - name: Smoke test — frontend liveness check
        run: |
          status=$(curl --silent --output /dev/null --write-out "%{http_code}" \
                        --retry 5 \
                        --retry-delay 15 \
                        --retry-connrefused \
                        --retry-all-errors \
                        https://${{ vars.WEBAPP_FRONTEND }}.azurewebsites.net) || exit 1
          if [ "$status" -ge 500 ]; then
            echo "Frontend returned HTTP $status — smoke test failed"
            exit 1
          fi
          echo "Frontend returned HTTP $status — smoke test passed"
```

**Verify:** File exists at `.github/workflows/_deploy.yml`. YAML is well-formed (open the file and confirm no syntax errors).

**Commit:**
```
PLATFORM-457: add _deploy.yml reusable deploy workflow
```

---

## Task 2 — [AGENT] Rename `ci-test.yml` → `ci.yml` and refactor deploy job

**Files:**
- `.github/workflows/ci-test.yml` (delete)
- `.github/workflows/ci.yml` (new)

Delete `ci-test.yml` and create `ci.yml`. The `build-and-push` job is unchanged except for
the workflow name. The `deploy` job is replaced by `call-deploy`, which delegates to
`_deploy.yml` via `uses:` with `environment: test` and the SHA output from the build job.
The build job retains `environment: test` because ACR login requires the test environment's
OIDC credentials (`AZURE_CLIENT_ID`, `ACR_LOGIN_SERVER`).

```yaml
# .github/workflows/ci.yml
name: CI — Build and Push

on:
  push:
    branches:
      - development
    paths:
      - 'frontend/**'
      - 'backend/**'

permissions:
  id-token: write
  contents: read

env:
  IMAGE_FRONTEND: app-insights-explorer-frontend
  IMAGE_API: app-insights-explorer-api

jobs:
  build-and-push:
    name: Build and push Docker images
    runs-on: ubuntu-latest
    environment: test
    outputs:
      short_sha: ${{ steps.sha.outputs.short_sha }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Get short git SHA
        id: sha
        run: echo "short_sha=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT

      - name: Log in to Azure via OIDC
        uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

      - name: Log in to ACR
        run: az acr login --name $(echo "${{ vars.ACR_LOGIN_SERVER }}" | cut -d'.' -f1)

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push frontend image
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          file: ./frontend/Dockerfile
          push: true
          tags: |
            ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_FRONTEND }}:latest
            ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_FRONTEND }}:${{ steps.sha.outputs.short_sha }}
          build-args: |
            NEXT_PUBLIC_API_URL=https://${{ vars.WEBAPP_API }}.azurewebsites.net
            NEXT_PUBLIC_BACKEND_API_SECRET=${{ secrets.BACKEND_API_SECRET }}

      - name: Build and push API image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: true
          tags: |
            ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_API }}:latest
            ${{ vars.ACR_LOGIN_SERVER }}/${{ env.IMAGE_API }}:${{ steps.sha.outputs.short_sha }}

  call-deploy:
    name: Deploy to TEST
    needs: build-and-push
    uses: ./.github/workflows/_deploy.yml
    with:
      environment: test
      sha: ${{ needs.build-and-push.outputs.short_sha }}
    secrets: inherit
```

**Verify:** `.github/workflows/ci-test.yml` no longer exists. `.github/workflows/ci.yml` exists
and the `call-deploy` job references `_deploy.yml`.

**Commit:**
```
PLATFORM-457: rename ci-test.yml to ci.yml, replace deploy job with _deploy.yml call
```

---

## Task 3 — [AGENT] Create `ci-release.yml` release pipeline

**Files:** `.github/workflows/ci-release.yml` (new)

The `get-sha` job checks out the release branch and captures the git short SHA — the same SHA
that was already built and pushed to ACR when this commit landed on `development`. No Docker
build, no Buildx. `deploy-staging` runs automatically. `deploy-production` is gated by the
GitHub environment protection rule on the `production` environment (one required reviewer) —
no additional YAML is needed to create the gate.

```yaml
# .github/workflows/ci-release.yml
name: CI Release — Promote SHA to Staging and Production

on:
  push:
    branches:
      - 'release/**'

permissions:
  id-token: write
  contents: read

jobs:
  get-sha:
    name: Get release SHA
    runs-on: ubuntu-latest
    outputs:
      short_sha: ${{ steps.sha.outputs.short_sha }}
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Get short git SHA
        id: sha
        run: echo "short_sha=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT

  deploy-staging:
    name: Deploy to STAGING
    needs: get-sha
    uses: ./.github/workflows/_deploy.yml
    with:
      environment: staging
      sha: ${{ needs.get-sha.outputs.short_sha }}
    secrets: inherit

  deploy-production:
    name: Deploy to PRODUCTION
    needs: [get-sha, deploy-staging]
    uses: ./.github/workflows/_deploy.yml
    with:
      environment: production
      sha: ${{ needs.get-sha.outputs.short_sha }}
    secrets: inherit
```

**Verify:** File exists at `.github/workflows/ci-release.yml`. Confirm `deploy-production`
lists both `get-sha` and `deploy-staging` in its `needs:` array so production cannot start
until staging succeeds.

**Commit:**
```
PLATFORM-457: add ci-release.yml SHA-promotion release pipeline
```

---

## Task 4a — [AGENT] Add OIDC federated credentials for staging and production

**Files:** `infra/shared/oidc.tf` (modify)

The CI/CD service principal currently has federated credentials for `development`, `test`, and
`pull_request`. Add two more resources following the identical pattern used for `cicd_test_environment`.

```hcl
resource "azuread_application_federated_identity_credential" "cicd_staging_environment" {
  application_id = data.azuread_application.cicd.id
  display_name   = "github-environment-staging"
  description    = "GitHub Actions OIDC credential for the staging environment."
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:frankendoodle/app-insights-explorer:environment:staging"
}

resource "azuread_application_federated_identity_credential" "cicd_production_environment" {
  application_id = data.azuread_application.cicd.id
  display_name   = "github-environment-production"
  description    = "GitHub Actions OIDC credential for the production environment."
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:frankendoodle/app-insights-explorer:environment:production"
}
```

Applied via `workflow_dispatch` after the PR merges — `infra/shared/` is never auto-applied
on push. No manual Azure Portal steps needed.

**Trigger:** GitHub Actions → Terraform Plan / Apply → Run workflow → job: apply, environment: shared

**Verify:** After the workflow run completes, confirm in Azure Portal → App Registrations →
CI/CD SP → Certificates & secrets → Federated credentials — two new entries
`github-environment-staging` and `github-environment-production` appear alongside the
existing three.

**Commit:**
```
PLATFORM-457: add OIDC federated credentials for staging and production environments
```

---

## Task 4b — [HUMAN] Create `staging` GitHub environment

**Do this after `terraform apply infra/envs/staging` has run and output the resource names.**

**Where:** GitHub → repository → Settings → Environments → New environment

1. Name the environment `staging` (lowercase, exact match — the workflow passes this string
   directly to `environment:` in `_deploy.yml`).
2. No protection rules needed for staging.
3. Add the following **Variables** (Settings → Environments → staging → Environment variables):

**Deployment variables** (needed by `_deploy.yml`):

| Variable | Where to get the value |
|---|---|
| `WEBAPP_FRONTEND` | `terraform -chdir=infra/envs/staging output webapp_frontend_name` |
| `WEBAPP_API` | `terraform -chdir=infra/envs/staging output webapp_api_name` |
| `KV_NAME` | `terraform -chdir=infra/envs/staging output kv_name` |
| `ACR_LOGIN_SERVER` | `terraform -chdir=infra/shared output acr_login_server` |
| `AZURE_CLIENT_ID` | same value as in `test` environment |
| `AZURE_TENANT_ID` | same value as in `test` environment |
| `AZURE_SUBSCRIPTION_ID` | same value as in `test` environment |

**Terraform apply variables** (needed by `apply-staging` in `terraform.yml`):

| Variable | Where to get the value |
|---|---|
| `ACR_ID` | same value as in `test` environment |
| `SSO_CLIENT_ID` | same value as in `test` environment |
| `CICD_SP_OBJECT_ID` | same value as in `test` environment |
| `TF_BACKEND_RESOURCE_GROUP` | same value as in `test` environment |
| `TF_BACKEND_STORAGE_ACCOUNT` | same value as in `test` environment |

4. Add the following **Secrets** (Settings → Environments → staging → Environment secrets):

| Secret | Value |
|---|---|
| `AZURE_AD_CLIENT_ID` | SSO app registration client ID (same as test unless staging uses a separate app reg) |
| `AZURE_AD_CLIENT_SECRET` | SSO app registration client secret |
| `ANTHROPIC_API_KEY` | Anthropic API key (same value across environments) |
| `BACKEND_API_SECRET` | Backend API shared secret (can use a new value for staging isolation) |
| `NEXTAUTH_SECRET` | NextAuth secret (can use a new value for staging isolation) |

**Verify:** Navigate to Settings → Environments → staging. Confirm all 7 Variables and 5 Secrets
are present. No typos in variable names — they must match exactly what `_deploy.yml` references.

---

## Task 4c — [HUMAN] Create `production` GitHub environment

**Do this after `terraform apply infra/envs/production` has run. Same steps as 4b with two
differences: different Terraform output values, and a required-reviewer protection rule.**

**Where:** GitHub → repository → Settings → Environments → New environment

1. Name the environment `production`.
2. Under **Protection rules**, enable **Required reviewers** and add yourself (or the
   designated approver). Set count to 1.
3. Add **Variables** — same two groups as staging (deployment variables from `terraform -chdir=infra/envs/production output`, Terraform apply variables with same values as staging).
4. Add **Secrets** — same names as staging, with production-appropriate values.

**Verify:** Settings → Environments → production shows the required-reviewer badge. All 7
Variables and 5 Secrets are present.

---

## Task 4d — [HUMAN] End-to-end release verification

**Do this after 4a, 4b, and 4c are all complete.**

1. Confirm the commit you want to release has a successful CI run on `development` (the Docker
   images for that SHA exist in ACR).
2. Create and push a release branch from that commit:
   ```powershell
   git checkout -b release/0.1.0
   git push origin release/0.1.0
   ```
3. In GitHub Actions, watch the `CI Release` workflow trigger on the push.
4. Confirm `deploy-staging` runs and completes successfully.
5. Confirm `deploy-production` shows a **waiting for approval** state — do not approve yet.
   Check that the correct reviewer is listed.
6. Approve the production deployment.
7. Confirm `deploy-production` completes successfully.

**If staging fails with a 401:** The `infra/shared/` Terraform apply has not run yet, or the
staging federated credential was not created. Confirm `terraform apply infra/shared/` completed
successfully after the PR merged.

**If staging fails with a resource-not-found error:** Terraform hasn't been applied for
`infra/envs/staging`, or the Variable values in the GitHub environment don't match the actual
resource names.

**If production approval gate does not appear:** The `production` GitHub environment either
doesn't exist or has no required reviewer configured. Re-check Task 4c.

No commit for this task.

---

## Completion Protocol

When all code tasks are committed:

1. Update `docs/jira/PLATFORM-457/plans/manifest.md` — set this plan's `status` to `complete`
2. Check off `implement` in `docs/jira/PLATFORM-457/dossier.md` pipeline checklist
3. Transition PLATFORM-464 to Done in Jira
4. Open a PR from the feature branch into `development`

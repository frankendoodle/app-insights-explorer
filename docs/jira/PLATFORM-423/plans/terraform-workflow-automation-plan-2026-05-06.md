---
title: "Terraform Workflow Automation — Implementation Plan"
ticket: PLATFORM-423
spec: specs/terraform-workflow-automation-spec-2026-05-06.md
manifest: manifest.md
date: 2026-05-06
tags: [ai/generated, jira/implementation-plan]
tech_stack: ["Terraform >= 1.9", "GitHub Actions", "azuread ~> 3.0", "azurerm ~> 4.0"]
testing_strategy: manual
validation_commands:
  - "terraform -chdir=infra/shared validate"
  - "terraform -chdir=infra/envs/test validate"
---

> Automated review ran; no revisions were needed.

# Terraform Workflow Automation — Implementation Plan

**Goal:** Replace the manual `terraform apply` process with a GitHub Actions workflow that runs `terraform plan` on PRs and `terraform apply` on pushes to `development`, both scoped to `infra/**` changes.

**Architecture:** A new `azuread_application_federated_identity_credential` resource in `infra/shared/oidc.tf` enables OIDC authentication for PR workflow contexts (subject `pull_request`). A new `.github/workflows/terraform.yml` workflow uses `azure/login@v2` + `hashicorp/setup-terraform@v3` to init and plan/apply both Terraform modules in sequence. Plan output is captured to temp files and posted as a PR comment via `actions/github-script@v7`, with artifact fallback for output exceeding 65,536 characters.

**Tech Stack:** Terraform >= 1.9, GitHub Actions (ubuntu-latest), `hashicorp/setup-terraform@v3`, `actions/github-script@v7`, `azure/login@v2`, `azuread ~> 3.0`, `azurerm ~> 4.0`

**Testing Strategy:** Manual verification

**Validation Commands:**
- `terraform -chdir=infra/shared validate`
- `terraform -chdir=infra/envs/test validate`

---

## Executor Summary

| Task | Executor | Notes |
|------|----------|-------|
| Task 1 — Add OIDC credential | AI Agent | Code change only; commit to feature branch |
| Task 2 — Bootstrap apply | Human Developer | Must run locally before PR is opened |
| Task 3 — Set GitHub Variables | Human Developer | Must be done before first workflow run |
| Task 4 — Create terraform.yml | AI Agent | Code change only; commit to feature branch |

## Human Operator Sequence

Two tasks require direct human action. Complete them in this order:

**Step A — After Task 1 is committed (before opening the PR):**
Run Task 2. The `cicd_pull_request` OIDC credential does not exist in Azure until this apply runs. If you open the PR first, the plan job will immediately fail with an authentication error and there is no recovery path other than running the apply and re-triggering the job.

**Step B — Before the first workflow run (can be done in parallel with Task 4):**
Run Task 3. The `ACR_ID`, `SSO_CLIENT_ID`, and `CICD_SP_OBJECT_ID` Variables must exist in GitHub before the plan or apply jobs run. The workflow will fail at the terraform plan/apply step if any are missing.

**Recommended full sequence:**
1. Agent: Task 1 — commit `infra/shared/oidc.tf` change
2. Human: Task 2 — `terraform apply infra/shared/` locally
3. Human: Task 3 — set the three GitHub Variables
4. Agent: Task 4 — commit `.github/workflows/terraform.yml`
5. Open PR → plan job authenticates and runs

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `infra/shared/oidc.tf` | Modify | Add `cicd_pull_request` federated credential resource |
| `.github/workflows/terraform.yml` | Create | Plan-on-PR and apply-on-push workflow |

---

### Task 1: Add OIDC federated credential for pull_request context

**Executor:** AI Agent

**Files:**
- Modify: `infra/shared/oidc.tf`

- [ ] **Step 1: Implement**

Add the following resource block to `infra/shared/oidc.tf`, after the existing `cicd_test_environment` resource:

```terraform
# OIDC federated credential — scoped to pull_request workflow context.
# Required for the terraform.yml plan job to authenticate on PRs.
# Must be applied manually once before the first PR triggers the plan job.
resource "azuread_application_federated_identity_credential" "cicd_pull_request" {
  application_id = data.azuread_application.cicd.id
  display_name   = "github-pull-request"
  description    = "GitHub Actions OIDC credential for pull_request workflow context."
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:frankendoodle/app-insights-explorer:pull_request"
}
```

The full updated `infra/shared/oidc.tf` after this change:

```terraform
# Look up the CI/CD App Registration by its SP object ID.
# The SP object ID comes from bootstrap.sh output (SP_OBJECT_ID).
data "azuread_service_principal" "cicd" {
  object_id = var.cicd_sp_object_id
}

# Look up the backing App Registration for the CI/CD SP.
data "azuread_application" "cicd" {
  client_id = data.azuread_service_principal.cicd.client_id
}

# OIDC federated credential — scoped to the development branch.
# Enables GitHub Actions to authenticate to Azure without stored credentials.
resource "azuread_application_federated_identity_credential" "cicd_development" {
  application_id = data.azuread_application.cicd.id
  display_name   = "github-development"
  description    = "GitHub Actions OIDC credential for the development branch."
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:frankendoodle/app-insights-explorer:ref:refs/heads/development"
}

# OIDC federated credential — scoped to the test environment.
# Required when workflow jobs specify `environment: test` — GitHub issues a token
# with subject `environment:test` instead of the branch-based subject above.
resource "azuread_application_federated_identity_credential" "cicd_test_environment" {
  application_id = data.azuread_application.cicd.id
  display_name   = "github-environment-test"
  description    = "GitHub Actions OIDC credential for the test environment."
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:frankendoodle/app-insights-explorer:environment:test"
}

# OIDC federated credential — scoped to pull_request workflow context.
# Required for the terraform.yml plan job to authenticate on PRs.
# Must be applied manually once before the first PR triggers the plan job.
resource "azuread_application_federated_identity_credential" "cicd_pull_request" {
  application_id = data.azuread_application.cicd.id
  display_name   = "github-pull-request"
  description    = "GitHub Actions OIDC credential for pull_request workflow context."
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = "repo:frankendoodle/app-insights-explorer:pull_request"
}
```

- [ ] **Step 2: Verify**

Run: `terraform -chdir=infra/shared validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-423: add pull_request OIDC federated credential"`

---

### Task 2: Bootstrap — apply infra/shared/ to register the pull_request credential

**Executor:** Human Developer — run locally after Task 1 is committed, before opening the PR.

**⚠️ This task must be completed before opening any PR. The credential does not exist in Azure until this apply runs. The plan job will fail with an OIDC authentication error on any PR opened before this step.**

**Files:** None (Terraform state change only — no code commit)

- [ ] **Step 1: Implement**

Ensure you are authenticated with your personal Microsoft account:

```bash
az login
```

Run init (backend values confirmed from PLATFORM-3 artifacts):

```bash
terraform -chdir=infra/shared init \
  -backend-config="resource_group_name=rg-aie-tfstate-3" \
  -backend-config="storage_account_name=aietfstate3" \
  -backend-config="container_name=tfstate3" \
  -backend-config="key=shared.tfstate"
```

Apply:

```bash
terraform -chdir=infra/shared apply \
  -var="cicd_sp_object_id=248d95d0-05f1-4f3b-9f47-d30ee66ffbec"
```

Type `yes` when prompted.

- [ ] **Step 2: Verify**

Option A — CLI (replace `<AZURE_CLIENT_ID>` with the value of the `AZURE_CLIENT_ID` GitHub Variable, which is the CI/CD service principal's application ID):

```bash
az ad app federated-credential list \
  --id <AZURE_CLIENT_ID> \
  --query "[].subject" -o tsv
```

Expected output includes: `repo:frankendoodle/app-insights-explorer:pull_request`

Option B — Azure portal: Navigate to **Azure Active Directory → App registrations → app-insights-explorer CI/CD app → Certificates & secrets → Federated credentials**. Confirm a credential named `github-pull-request` appears with subject `repo:frankendoodle/app-insights-explorer:pull_request`.

---

### Task 3: Set GitHub Variables ACR_ID, SSO_CLIENT_ID, CICD_SP_OBJECT_ID

**Executor:** Human Developer — GitHub UI action, can be done in parallel with Task 4.

**This task has no code change.** The three values are available from prior Terraform output.

- [ ] **Step 1: Retrieve values**

Run from your local machine (authenticated, with the shared module initialized from Task 2):

```bash
terraform -chdir=infra/shared output acr_id
terraform -chdir=infra/shared output sso_client_id
```

`CICD_SP_OBJECT_ID` is already known: `248d95d0-05f1-4f3b-9f47-d30ee66ffbec`.

- [ ] **Step 2: Implement**

In the GitHub repository, navigate to **Settings → Secrets and variables → Actions → Variables tab**.

Add three new repository variables:

| Name | Value |
|------|-------|
| `ACR_ID` | Output of `terraform -chdir=infra/shared output acr_id` |
| `SSO_CLIENT_ID` | Output of `terraform -chdir=infra/shared output sso_client_id` |
| `CICD_SP_OBJECT_ID` | `248d95d0-05f1-4f3b-9f47-d30ee66ffbec` |

- [ ] **Step 3: Verify**

In the same Variables tab, confirm all three variables appear in the list alongside the existing six variables (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `TF_BACKEND_RESOURCE_GROUP`, `TF_BACKEND_STORAGE_ACCOUNT`, `ACR_LOGIN_SERVER`).

---

### Task 4: Create .github/workflows/terraform.yml

**Executor:** AI Agent

**Files:**
- Create: `.github/workflows/terraform.yml`

- [ ] **Step 1: Implement**

Create `.github/workflows/terraform.yml` with the following content:

```yaml
name: Terraform Plan / Apply

on:
  pull_request:
    branches:
      - development
    paths:
      - 'infra/**'
  push:
    branches:
      - development
    paths:
      - 'infra/**'

permissions:
  id-token: write
  contents: read
  pull-requests: write

jobs:
  plan:
    name: Terraform Plan
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Log in to Azure via OIDC
        uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

      - name: Set up Terraform
        uses: hashicorp/setup-terraform@v3

      - name: Init infra/shared
        run: |
          terraform -chdir=infra/shared init \
            -input=false \
            -backend-config="resource_group_name=${{ vars.TF_BACKEND_RESOURCE_GROUP }}" \
            -backend-config="storage_account_name=${{ vars.TF_BACKEND_STORAGE_ACCOUNT }}" \
            -backend-config="container_name=tfstate3" \
            -backend-config="key=shared.tfstate"

      - name: Plan infra/shared
        run: |
          terraform -chdir=infra/shared plan \
            -no-color \
            -input=false \
            -var="cicd_sp_object_id=${{ vars.CICD_SP_OBJECT_ID }}" \
            2>&1 | tee /tmp/shared_plan.txt

      - name: Init infra/envs/test
        run: |
          terraform -chdir=infra/envs/test init \
            -input=false \
            -backend-config="resource_group_name=${{ vars.TF_BACKEND_RESOURCE_GROUP }}" \
            -backend-config="storage_account_name=${{ vars.TF_BACKEND_STORAGE_ACCOUNT }}" \
            -backend-config="container_name=tfstate3" \
            -backend-config="key=test.tfstate"

      - name: Plan infra/envs/test
        run: |
          terraform -chdir=infra/envs/test plan \
            -no-color \
            -input=false \
            -var="acr_login_server=${{ vars.ACR_LOGIN_SERVER }}" \
            -var="acr_id=${{ vars.ACR_ID }}" \
            -var="sso_client_id=${{ vars.SSO_CLIENT_ID }}" \
            -var="cicd_sp_object_id=${{ vars.CICD_SP_OBJECT_ID }}" \
            2>&1 | tee /tmp/test_plan.txt

      - name: Upload plan output as artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: terraform-plan-${{ github.event.pull_request.number }}
          path: |
            /tmp/shared_plan.txt
            /tmp/test_plan.txt
          if-no-files-found: ignore

      - name: Post plan comment
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs')
            const shared = fs.existsSync('/tmp/shared_plan.txt')
              ? fs.readFileSync('/tmp/shared_plan.txt', 'utf8')
              : '(plan output unavailable)'
            const test = fs.existsSync('/tmp/test_plan.txt')
              ? fs.readFileSync('/tmp/test_plan.txt', 'utf8')
              : '(plan output unavailable)'
            const body = [
              '## Terraform Plan',
              '',
              '### `infra/shared`',
              '```',
              shared.trim(),
              '```',
              '',
              '### `infra/envs/test`',
              '```',
              test.trim(),
              '```',
            ].join('\n')
            if (body.length > 65536) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo:  context.repo.repo,
                issue_number: context.issue.number,
                body: `## Terraform Plan\n\nPlan output exceeds the GitHub comment size limit. [View full plan in workflow artifacts](${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}).`
              })
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo:  context.repo.repo,
                issue_number: context.issue.number,
                body
              })
            }

  apply:
    name: Terraform Apply
    runs-on: ubuntu-latest
    if: github.event_name == 'push'
    environment: test
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Log in to Azure via OIDC
        uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}

      - name: Set up Terraform
        uses: hashicorp/setup-terraform@v3

      - name: Init infra/shared
        run: |
          terraform -chdir=infra/shared init \
            -input=false \
            -backend-config="resource_group_name=${{ vars.TF_BACKEND_RESOURCE_GROUP }}" \
            -backend-config="storage_account_name=${{ vars.TF_BACKEND_STORAGE_ACCOUNT }}" \
            -backend-config="container_name=tfstate3" \
            -backend-config="key=shared.tfstate"

      - name: Apply infra/shared
        run: |
          terraform -chdir=infra/shared apply \
            -auto-approve \
            -input=false \
            -var="cicd_sp_object_id=${{ vars.CICD_SP_OBJECT_ID }}"

      - name: Init infra/envs/test
        run: |
          terraform -chdir=infra/envs/test init \
            -input=false \
            -backend-config="resource_group_name=${{ vars.TF_BACKEND_RESOURCE_GROUP }}" \
            -backend-config="storage_account_name=${{ vars.TF_BACKEND_STORAGE_ACCOUNT }}" \
            -backend-config="container_name=tfstate3" \
            -backend-config="key=test.tfstate"

      - name: Apply infra/envs/test
        run: |
          terraform -chdir=infra/envs/test apply \
            -auto-approve \
            -input=false \
            -var="acr_login_server=${{ vars.ACR_LOGIN_SERVER }}" \
            -var="acr_id=${{ vars.ACR_ID }}" \
            -var="sso_client_id=${{ vars.SSO_CLIENT_ID }}" \
            -var="cicd_sp_object_id=${{ vars.CICD_SP_OBJECT_ID }}"
```

- [ ] **Step 2: Verify**

Run: `terraform -chdir=infra/shared validate && terraform -chdir=infra/envs/test validate`
Expected: `Success! The configuration is valid.` for both modules.

Confirm YAML syntax is valid by opening the file in VS Code or running `yamllint .github/workflows/terraform.yml` if yamllint is installed.

- [ ] **Step 3: Commit**

`git commit -m "PLATFORM-423: add terraform plan/apply GitHub Actions workflow"`

---

### Final: Close-out

This plan is not complete until the close-out protocol in `manifest.md` has been followed. Do not mark this plan as complete without completing close-out.

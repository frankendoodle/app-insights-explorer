# Partial backend configuration — supply storage details at terraform init:
#
#   terraform -chdir=infra/envs/staging init `
#     -backend-config="resource_group_name=rg-aie-tfstate-3" `
#     -backend-config="storage_account_name=aietfstate3" `
#     -backend-config="container_name=tfstate3-staging" `
#     -backend-config="key=staging.tfstate"
#
terraform {
  backend "azurerm" {
    key = "staging.tfstate"
  }
}

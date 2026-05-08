# Partial backend configuration — supply storage details at terraform init:
#
#   terraform -chdir=infra/envs/production init `
#     -backend-config="resource_group_name=rg-aie-tfstate-3" `
#     -backend-config="storage_account_name=aietfstate3" `
#     -backend-config="container_name=tfstate3-production" `
#     -backend-config="key=production.tfstate"
#
terraform {
  backend "azurerm" {
    key = "production.tfstate"
  }
}

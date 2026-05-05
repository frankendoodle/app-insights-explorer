# Partial backend configuration — supply storage details at terraform init:
#
#   terraform init \
#     -backend-config="resource_group_name=<TFSTATE_RG>" \
#     -backend-config="storage_account_name=<TFSTATE_SA>" \
#     -backend-config="container_name=tfstate" \
#     -backend-config="key=shared.tfstate"
#
terraform {
  backend "azurerm" {
    key = "shared.tfstate"
  }
}

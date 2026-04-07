terraform {
  backend "azurerm" {
    container_name = "tfstate"
    key            = "app-insights-explorer/shared.tfstate"
    # resource_group_name and storage_account_name are passed via -backend-config at runtime
  }
}

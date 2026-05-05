# ── Path A — managed resources (use if Task 3 validation apply succeeded) ─────
#
# lifecycle.ignore_changes is required on required_resource_access and
# optional_claims: Terraform cannot replicate admin consent grants. Without
# ignore_changes, each subsequent apply would strip portal-applied consent,
# silently breaking the OAuth flow.
#
# If Task 3 failed with Authorization_RequestDenied, delete the resources below
# and use Path B instead (see comments at the bottom of this file).
#
resource "azuread_application" "sso" {
  display_name     = "app-insights-explorer-sso-tfg"
  sign_in_audience = "AzureADandPersonalMicrosoftAccount"

  web {
    redirect_uris = [
      "https://app-aie-frontend-test-tfg.azurewebsites.net/api/auth/callback/azure-ad",
    ]
  }

  lifecycle {
    ignore_changes = [
      required_resource_access,
      optional_claims,
    ]
  }
}

resource "azuread_service_principal" "sso" {
  client_id = azuread_application.sso.client_id
}

# ── Path B — data sources (use if Task 3 failed with Authorization_RequestDenied)
#
# Delete the two resources above and uncomment the two data sources below.
# Before applying, create the App Registration manually in the Azure portal:
#   display name:          app-insights-explorer-sso-tfg
#   supported account types: AzureADandPersonalMicrosoftAccount
#   redirect URI (Web):    https://app-aie-frontend-test-tfg.azurewebsites.net/api/auth/callback/azure-ad
#
# data "azuread_application" "sso" {
#   display_name = "app-insights-explorer-sso-tfg"
# }
#
# data "azuread_service_principal" "sso" {
#   client_id = data.azuread_application.sso.client_id
# }
#
# Also update outputs.tf: replace azuread_application.sso → data.azuread_application.sso
#                          replace azuread_service_principal.sso → data.azuread_service_principal.sso

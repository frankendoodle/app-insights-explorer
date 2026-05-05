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

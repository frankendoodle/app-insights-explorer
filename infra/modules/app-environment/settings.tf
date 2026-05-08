locals {
  kv_uri = azurerm_key_vault.test.vault_uri

  # Key Vault reference string helper — no version pin so references always
  # resolve to the current secret version without requiring a re-apply.
  kv_ref = {
    app_reg_client_id     = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/AppRegistrationClientId/)"
    app_reg_client_secret = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/AppRegistrationClientSecret/)"
    anthropic_api_key     = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/AnthropicApiKey/)"
    backend_api_secret    = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/BackendApiSecret/)"
    nextauth_secret       = "@Microsoft.KeyVault(SecretUri=${local.kv_uri}secrets/NextAuthSecret/)"
  }
}

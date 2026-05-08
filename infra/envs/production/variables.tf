variable "acr_login_server" {
  description = "Login server URL for the ACR provisioned by infra/shared/. Retrieve from: terraform -chdir=infra/shared output acr_login_server"
  type        = string
}

variable "acr_id" {
  description = "Resource ID of the ACR provisioned by infra/shared/. Retrieve from: terraform -chdir=infra/shared output acr_id"
  type        = string
}

variable "sso_client_id" {
  description = "Application (client) ID of the SSO App Registration provisioned by infra/shared/. Retrieve from: terraform -chdir=infra/shared output sso_client_id"
  type        = string
}

variable "cicd_sp_object_id" {
  description = "Object ID of the CI/CD service principal created by bootstrap.sh. Required to grant Key Vault Secrets Officer so the CI step can write secrets. Retrieve from bootstrap.sh output (SP_OBJECT_ID)."
  type        = string
}

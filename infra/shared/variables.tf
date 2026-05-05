variable "cicd_sp_object_id" {
  description = "Object ID of the CI/CD service principal created by bootstrap.sh. Required to attach the OIDC federated credential. Retrieve from bootstrap.sh output (SP_OBJECT_ID)."
  type        = string
}

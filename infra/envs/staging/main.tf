module "app_environment" {
  source            = "../../modules/app-environment"
  env_name          = "staging"
  suffix            = "tfg"
  acr_login_server  = var.acr_login_server
  acr_id            = var.acr_id
  sso_client_id     = var.sso_client_id
  cicd_sp_object_id = var.cicd_sp_object_id
}

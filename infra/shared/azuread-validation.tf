# TEMPORARY — delete this file after validation. See Task 3 in the plan.
#
# Run to determine whether Path A (managed resources) or Path B (data sources)
# applies for the SSO App Registration in Task 5:
#
#   terraform apply \
#     -var cicd_sp_object_id=<SP_OBJECT_ID_FROM_BOOTSTRAP> \
#     -target azuread_application.validation \
#     -target azuread_service_principal.validation
#
# If apply succeeds  → Path A (managed resources). Destroy and delete this file.
# If Authorization_RequestDenied → Path B (data sources). Delete this file without destroy.
#
resource "azuread_application" "validation" {
  display_name = "aie-tfg-azuread-validation"
}

resource "azuread_service_principal" "validation" {
  client_id = azuread_application.validation.client_id
}

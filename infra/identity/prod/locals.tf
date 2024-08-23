locals {
  prefix    = "io"
  env_short = "p"
  env       = "prod"
  location  = "italynorth"
  project   = "${local.prefix}-${local.env_short}"
  domain    = "functions-app-messages"

  repo_name = "io-functions-app-messages"

  tags = {
    CostCenter     = "TS310 - PAGAMENTI & SERVIZI"
    CreatedBy      = "Terraform"
    Environment    = "Prod"
    Owner          = "IO"
    ManagementTeam = "IO Comunicazione"
    Source         = "https://github.com/pagopa/io-functions-app-messages/blob/master/infra/identity/prod"
  }
}

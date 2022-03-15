import { CdnManagementClient } from "@azure/arm-cdn";
import { ClientSecretCredential } from "@azure/identity";
import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

const credential = new ClientSecretCredential(
  config.CDN_AZURE_TENANT_ID,
  config.CDN_AZURE_CLIENT_ID,
  config.CDN_AZURE_CLIENT_SECRET
);

export const CDN_CLIENT = new CdnManagementClient(
  credential,
  config.CDN_SUBSCRIPTION_ID
);

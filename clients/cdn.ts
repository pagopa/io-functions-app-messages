import { CdnManagementClient } from "@azure/arm-cdn";
import { ClientSecretCredential } from "@azure/identity";
import { getConfigOrThrow } from "../utils/config";

const config = getConfigOrThrow();

const credential = new ClientSecretCredential(
  config.ENABLE_CDN_PURGE ? config.CDN_AZURE_TENANT_ID : "CDN_AZURE_TENANT_ID",
  config.ENABLE_CDN_PURGE ? config.CDN_AZURE_CLIENT_ID : "CDN_AZURE_CLIENT_ID",
  config.ENABLE_CDN_PURGE
    ? config.CDN_AZURE_CLIENT_SECRET
    : "CDN_AZURE_CLIENT_SECRET"
);

export const CDN_CLIENT = new CdnManagementClient(
  credential,
  config.ENABLE_CDN_PURGE ? config.CDN_SUBSCRIPTION_ID : "CDN_SUBSCRIPTION_ID"
);

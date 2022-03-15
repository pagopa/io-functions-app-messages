import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { IConfig } from "../utils/config";

const aBlacklistedFiscalCode = "AAAAAA00A00H501I" as FiscalCode;

export const envConfig: IConfig = {
  isProduction: false,

  COSMOSDB_KEY: "aKey" as NonEmptyString,
  COSMOSDB_NAME: "aName" as NonEmptyString,
  COSMOSDB_URI: "aUri" as NonEmptyString,

  CDN_ASSETS_ENDPOINT_NAME: "aaa" as NonEmptyString,
  CDN_AZURE_CLIENT_ID: "aaa" as NonEmptyString,
  CDN_AZURE_CLIENT_SECRET: "aaa" as NonEmptyString,
  CDN_AZURE_TENANT_ID: "aaa" as NonEmptyString,
  CDN_PROFILE_NAME: "aaa" as NonEmptyString,
  CDN_SERVICE_BASE_PATH: "aaa" as NonEmptyString,
  CDN_RESOURCE_GROUP_NAME: "aaa" as NonEmptyString,
  CDN_SUBSCRIPTION_ID: "aaa" as NonEmptyString,
  ENABLE_CDN_PURGE: true,

  MESSAGE_CONTAINER_NAME: "aaa" as NonEmptyString,

  QueueStorageConnection: "aaa" as NonEmptyString,

  NODE_ENV: "production",
  REQ_SERVICE_ID: undefined
};

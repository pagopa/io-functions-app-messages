import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { IConfig } from "../utils/config";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";

export const envConfig: IConfig = {
  isProduction: false,

  APPINSIGHTS_INSTRUMENTATIONKEY: "an-appinsights-key" as NonEmptyString,

  COSMOSDB_KEY: "aKey" as NonEmptyString,
  COSMOSDB_NAME: "aName" as NonEmptyString,
  COSMOSDB_URI: "aUri" as NonEmptyString,

  REMOTE_CONTENT_COSMOSDB_KEY: "aKey" as NonEmptyString,
  REMOTE_CONTENT_COSMOSDB_NAME: "aName" as NonEmptyString,
  REMOTE_CONTENT_COSMOSDB_URI: "aUri" as NonEmptyString,

  MESSAGE_CONTAINER_NAME: "aaa" as NonEmptyString,
  QueueStorageConnection: "aaa" as NonEmptyString,

  REDIS_URL: "aaa" as NonEmptyString,
  SERVICE_CACHE_TTL_DURATION: 10 as NonNegativeInteger,
  REMOTE_CONFIGURATION_CACHE_TTL_DURATION: 10 as NonNegativeInteger,

  FF_TYPE: "none",
  USE_FALLBACK: false,
  FF_BETA_TESTER_LIST: [],
  FF_CANARY_USERS_REGEX: "XYZ" as NonEmptyString,

  NODE_ENV: "production",
  REQ_SERVICE_ID: undefined,

  PN_SERVICE_ID: "a-pn-service-id" as NonEmptyString
};

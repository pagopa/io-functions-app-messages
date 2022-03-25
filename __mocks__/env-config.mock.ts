import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { IConfig } from "../utils/config";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";

const aBlacklistedFiscalCode = "AAAAAA00A00H501I" as FiscalCode;

export const envConfig: IConfig = {
  isProduction: false,

  COSMOSDB_KEY: "aKey" as NonEmptyString,
  COSMOSDB_NAME: "aName" as NonEmptyString,
  COSMOSDB_URI: "aUri" as NonEmptyString,

  MESSAGE_CONTAINER_NAME: "aaa" as NonEmptyString,
  QueueStorageConnection: "aaa" as NonEmptyString,

  REDIS_URL: "aaa" as NonEmptyString,
  SERVICE_CACHE_TTL_DURATION: 10 as NonNegativeInteger,

  FF_TYPE: "none",
  USE_FALLBACK: false,

  NODE_ENV: "production",
  REQ_SERVICE_ID: undefined
};

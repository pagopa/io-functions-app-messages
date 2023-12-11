import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { Has_preconditionEnum } from "../generated/definitions/ThirdPartyData";

export const getOrCacheRemoteServiceConfig = (
  service_id: NonEmptyString
): Has_preconditionEnum =>
  service_id ? Has_preconditionEnum.ALWAYS : Has_preconditionEnum.NEVER;

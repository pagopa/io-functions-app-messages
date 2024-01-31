import * as express from "express";
import * as TE from "fp-ts/TaskEither";

import { pipe } from "fp-ts/lib/function";

import {
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { Ulid } from "@pagopa/ts-commons/lib/strings";

import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";

import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RedisClient } from "redis";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  RCConfiguration,
  RCConfigurationModel
} from "@pagopa/io-functions-commons/dist/src/models/rc_configuration";
import { Context } from "@azure/functions";
import { getOrCacheMaybeRCConfiguration } from "../utils/remoteContentConfig";

type IGetRCConfigurationHandlerResponse =
  | IResponseSuccessJson<RCConfiguration>
  | IResponseErrorNotFound
  | IResponseErrorInternal;

/**
 * Type of a GetRCConfiguration handler.
 *
 * GetRCConfiguration expects a Configuration ID as input
 * and returns the remote content configuration as output or a Not Found or Validation
 * errors.
 */
type IGetRCConfigurationHandler = (
  context: Context,
  configurationId: Ulid
) => Promise<IGetRCConfigurationHandlerResponse>;

/**
 * Handles requests for getting a single remote content configuration for the requested id.
 */
export const GetRCConfigurationHandler = (
  rCConfigurationModel: RCConfigurationModel,
  redisClient: RedisClient,
  rCConfigurationCacheTtl: NonNegativeInteger
): IGetRCConfigurationHandler => async (
  _,
  configurationId
): Promise<IGetRCConfigurationHandlerResponse> =>
  pipe(
    getOrCacheMaybeRCConfiguration(
      redisClient,
      rCConfigurationModel,
      rCConfigurationCacheTtl,
      configurationId
    ),
    TE.mapLeft(e => ResponseErrorInternal(`${e.name}: ${e.message}`)),
    TE.chainW(
      TE.fromOption(() =>
        ResponseErrorNotFound(
          "Not Found",
          "The remote configuration that you requested was not found in the system."
        )
      )
    ),
    TE.map(ResponseSuccessJson),
    TE.toUnion
  )();

/**
 * Wraps a GetRCConfiguration handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, max-params
export function GetRCConfiguration(
  rCConfigurationModel: RCConfigurationModel,
  redisClient: RedisClient,
  serviceCacheTtl: NonNegativeInteger
): express.RequestHandler {
  const handler = GetRCConfigurationHandler(
    rCConfigurationModel,
    redisClient,
    serviceCacheTtl
  );
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("id", Ulid)
  );
  return wrapRequestHandler(middlewaresWrap(handler));
}

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
import { retrievedRCConfigurationToPublic } from "@pagopa/io-functions-commons/dist/src/utils/rc_configuration";
import { Context } from "@azure/functions";
import RCConfigurationUtility from "../utils/remoteContentConfig";
import { RCConfigurationPublic } from "../generated/definitions/RCConfigurationPublic";

type IGetRCConfigurationHandlerResponse =
  | IResponseSuccessJson<RCConfigurationPublic>
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
  rcConfigurationUtility: RCConfigurationUtility
): IGetRCConfigurationHandler => async (
  _,
  configurationId
): Promise<IGetRCConfigurationHandlerResponse> =>
  pipe(
    rcConfigurationUtility.getOrCacheMaybeRCConfigurationById(configurationId),
    TE.mapLeft(e => ResponseErrorInternal(`${e.name}: ${e.message}`)),
    TE.chainW(
      TE.fromOption(() =>
        ResponseErrorNotFound(
          "Not Found",
          "The remote configuration that you requested was not found in the system."
        )
      )
    ),
    TE.map(retrievedRCConfigurationToPublic),
    TE.map(ResponseSuccessJson),
    TE.toUnion
  )();

/**
 * Wraps a GetRCConfiguration handler inside an Express request handler.
 */
export const GetRCConfiguration = (
  rcConfigurationUtility: RCConfigurationUtility
): express.RequestHandler => {
  const handler = GetRCConfigurationHandler(rcConfigurationUtility);
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("id", Ulid)
  );
  return wrapRequestHandler(middlewaresWrap(handler));
};

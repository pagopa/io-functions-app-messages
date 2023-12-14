import { FiscalCodeMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/fiscalcode";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";
import { PageResults } from "@pagopa/io-functions-commons/dist/src/utils/paging";
import { defaultPageSize } from "@pagopa/io-functions-commons/dist/src/models/message";
import { OptionalQueryParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/optional_query_param";
import * as express from "express";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { BooleanFromString } from "@pagopa/ts-commons/lib/booleans";
import {
  NonNegativeInteger,
  NonNegativeIntegerFromString
} from "@pagopa/ts-commons/lib/numbers";
import {
  IResponseErrorInternal,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as O from "fp-ts/lib/Option";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { Context } from "@azure/functions";
import { RedisClient } from "redis";
import { enrichServiceData } from "../utils/messages";
import { IConfig } from "../utils/config";
import { IGetMessagesFunctionSelector } from "./getMessagesFunctions/getMessages.selector";

type IGetMessagesHandlerResponse =
  | IResponseSuccessJson<PageResults>
  | IResponseErrorInternal
  | IResponseErrorValidation
  | IResponseErrorQuery;

/**
 * Type of a GetMessages handler.
 *
 * GetMessages expects a FiscalCode as input and returns the Messages
 * as output or a Validation error.
 *
 */
type IGetMessagesHandler = (
  context: Context,
  fiscalCode: FiscalCode,
  maybePageSize: O.Option<NonNegativeInteger>,
  maybeEnrichResultData: O.Option<boolean>,
  maybeGetArchived: O.Option<boolean>,
  maybeMaximumId: O.Option<NonEmptyString>,
  maybeMinimumId: O.Option<NonEmptyString>
) => Promise<IGetMessagesHandlerResponse>;

/**
 * Handles requests for getting all message for a recipient.
 */
export const GetMessagesHandler = (
  functionSelector: IGetMessagesFunctionSelector,
  serviceModel: ServiceModel,
  redisClient: RedisClient,
  config: IConfig
  // eslint-disable-next-line max-params
): IGetMessagesHandler => async (
  context,
  fiscalCode,
  maybePageSize,
  maybeEnrichResultData,
  maybeGetArchived,
  maybeMaximumId,
  maybeMinimumId
  // eslint-disable-next-line max-params
): Promise<IGetMessagesHandlerResponse> =>
  pipe(
    TE.Do,
    TE.bind("pageSize", () =>
      TE.of(O.getOrElse(() => defaultPageSize)(maybePageSize))
    ),
    TE.bind("shouldEnrichResultData", () =>
      TE.of(O.getOrElse(() => false)(maybeEnrichResultData))
    ),
    TE.bind("shouldGetArchivedMessages", () =>
      TE.of(O.getOrElse(() => false)(maybeGetArchived))
    ),
    TE.bind("maximumId", () => TE.of(O.toUndefined(maybeMaximumId))),
    TE.bind("minimumId", () => TE.of(O.toUndefined(maybeMinimumId))),
    TE.chain(
      ({
        pageSize,
        shouldEnrichResultData,
        shouldGetArchivedMessages,
        maximumId,
        minimumId
      }) =>
        pipe(
          functionSelector.select({ fiscalCode }),
          getMessagesFunction =>
            getMessagesFunction({
              context,
              fiscalCode,
              maximumId,
              minimumId,
              pageSize,
              shouldEnrichResultData,
              shouldGetArchivedMessages
            }),
          TE.chainW(paginatedItems =>
            !shouldEnrichResultData
              ? TE.of(paginatedItems)
              : pipe(
                  paginatedItems.items,
                  enrichServiceData(
                    context,
                    serviceModel,
                    redisClient,
                    config.SERVICE_CACHE_TTL_DURATION
                  ),
                  TE.map((items: PageResults["items"]) => ({
                    ...paginatedItems,
                    items
                  }))
                )
          )
        )
    ),
    TE.mapLeft(e => {
      if (e instanceof Error) {
        return ResponseErrorInternal(e.message);
      } else {
        return ResponseErrorQuery(e.kind, e);
      }
    }),
    TE.map(ResponseSuccessJson),
    TE.toUnion
  )();

/**
 * Wraps a GetMessages handler inside an Express request handler.
 */
export const GetMessages = (
  functionSelector: IGetMessagesFunctionSelector,
  serviceModel: ServiceModel,
  redisClient: RedisClient,
  config: IConfig
  // eslint-disable-next-line max-params
): express.RequestHandler => {
  const handler = GetMessagesHandler(
    functionSelector,
    serviceModel,
    redisClient,
    config
  );
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    FiscalCodeMiddleware,
    OptionalQueryParamMiddleware("page_size", NonNegativeIntegerFromString),
    OptionalQueryParamMiddleware("enrich_result_data", BooleanFromString),
    OptionalQueryParamMiddleware("archived", BooleanFromString),
    OptionalQueryParamMiddleware("maximum_id", NonEmptyString),
    OptionalQueryParamMiddleware("minimum_id", NonEmptyString)
  );
  return wrapRequestHandler(middlewaresWrap(handler));
};

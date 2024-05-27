import * as express from "express";

import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as A from "fp-ts/lib/Apply";
import * as B from "fp-ts/lib/boolean";

import { BlobService } from "azure-storage";

import {
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseErrorValidation,
  IResponseSuccessJson,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import {
  FiscalCode,
  NonEmptyString,
  Ulid
} from "@pagopa/ts-commons/lib/strings";
import { withoutUndefinedValues } from "@pagopa/ts-commons/lib/types";

import { retrievedMessageToPublic } from "@pagopa/io-functions-commons/dist/src/utils/messages";
import { FiscalCodeMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/fiscalcode";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorQuery,
  ResponseErrorQuery
} from "@pagopa/io-functions-commons/dist/src/utils/response";

import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { flow, pipe } from "fp-ts/lib/function";
import { PaymentDataWithRequiredPayee } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentDataWithRequiredPayee";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { InternalMessageResponseWithContent } from "@pagopa/io-functions-commons/dist/generated/definitions/InternalMessageResponseWithContent";
import { PaymentData } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentData";
import { OptionalQueryParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/optional_query_param";
import { BooleanFromString } from "@pagopa/ts-commons/lib/booleans";
import { RedisClient } from "redis";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import * as TE from "fp-ts/lib/TaskEither";
import { TagEnum as TagEnumPayment } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPayment";
import { MessageStatusModel } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import {
  getOrCacheService,
  mapMessageCategory,
  ThirdPartyDataWithCategoryFetcher
} from "../utils/messages";
import { ThirdPartyData } from "../generated/definitions/ThirdPartyData";

/**
 * Type of a GetMessage handler.
 *
 * GetMessage expects a FiscalCode and a Message ID as input
 * and returns a Message as output or a Not Found or Validation
 * errors.
 */
type IGetMessageHandler = (
  context: Context,
  fiscalCode: FiscalCode,
  messageId: string,
  maybePublicMessage: O.Option<boolean>
) => Promise<
  | IResponseSuccessJson<InternalMessageResponseWithContent>
  | IResponseErrorNotFound
  | IResponseErrorQuery
  | IResponseErrorValidation
  | IResponseErrorForbiddenNotAuthorized
  | IResponseErrorInternal
>;

/**
 * In case a payment data exists and does not already contain the `payee` field,
 * it enriches the `payee` field with the sender service fiscal code.
 *
 * @param context
 * @param serviceModel
 * @param senderServiceId
 * @param maybePaymentData
 * @returns
 */
const getErrorOrPaymentData = async (
  context: Context,
  serviceModel: ServiceModel,
  redisClient: RedisClient,
  serviceCacheTtl: NonNegativeInteger,
  senderServiceId: ServiceId,
  maybePaymentData: O.Option<PaymentData>
): Promise<E.Either<
  IResponseErrorInternal,
  O.Option<PaymentDataWithRequiredPayee>
  // eslint-disable-next-line max-params
>> =>
  pipe(
    maybePaymentData,
    O.fold(
      () => TE.right(O.none),
      paymentData =>
        pipe(
          O.fromNullable(paymentData.payee),
          O.map(payee => ({ ...paymentData, payee })),
          O.map(flow(O.some, TE.of)),
          O.getOrElse(() =>
            pipe(
              getOrCacheService(
                senderServiceId,
                serviceModel,
                redisClient,
                serviceCacheTtl
              ),
              TE.mapLeft(err => {
                context.log.error(`GetMessageHandler|${JSON.stringify(err)}`);
                return ResponseErrorInternal(
                  `Cannot get message Sender Service|ERROR=${err.message}`
                );
              }),
              TE.map(senderService =>
                O.some({
                  ...paymentData,
                  payee: {
                    fiscal_code: senderService.organizationFiscalCode
                  }
                })
              )
            )
          )
        )
    )
  )();

/**
 * In case a third party data exists and does not already contain the `configuration_id` field,
 * it enriches the `configuration_id` field with the serviceToRCConfigurationMap using the `sender_service_id`.
 *
 * @param context
 * @param senderServiceId
 * @param serviceToRCConfigurationMap
 * @param maybeThirdPartyData
 * @returns
 */
const getErrorOrMaybeThirdPartyData = async (
  context: Context,
  senderServiceId: ServiceId,
  serviceToRCConfigurationMap: ReadonlyMap<string, string>,
  maybeThirdPartyData: O.Option<ThirdPartyData>
): Promise<E.Either<IResponseErrorInternal, O.Option<ThirdPartyData>>> =>
  pipe(
    maybeThirdPartyData,
    O.fold(
      () => TE.right(O.none),
      thirdPartyData =>
        pipe(
          O.fromNullable(thirdPartyData.configuration_id),
          O.map(configuration_id => ({ ...thirdPartyData, configuration_id })),
          O.map(flow(O.some, TE.of)),
          O.getOrElse(() =>
            pipe(
              O.fromNullable(serviceToRCConfigurationMap.get(senderServiceId)),
              TE.fromOption(() => {
                context.log.error(
                  `GetMessageHandler|Error getting configuration id for the service ${senderServiceId}`
                );
                return ResponseErrorInternal(
                  `Cannot convert SERVICE_TO_RCCONFIGURATION_MAP`
                );
              }),
              TE.map(configurationId =>
                O.some({
                  ...thirdPartyData,
                  configuration_id: configurationId as Ulid
                })
              )
            )
          )
        )
    )
  )();

/**
 * Handles requests for getting a single message for a recipient.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, max-params
export function GetMessageHandler(
  messageModel: MessageModel,
  messageStatusModel: MessageStatusModel,
  blobService: BlobService,
  serviceModel: ServiceModel,
  redisClient: RedisClient,
  serviceCacheTtl: NonNegativeInteger,
  serviceToRCConfigurationMap: ReadonlyMap<string, string>,
  categoryFetcher: ThirdPartyDataWithCategoryFetcher
): IGetMessageHandler {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  return async (context, fiscalCode, messageId, maybePublicMessage) => {
    const returnPublicMessage = O.getOrElse(() => false)(maybePublicMessage);

    const [errorOrMaybeDocument, errorOrMaybeContent] = await Promise.all([
      messageModel.findMessageForRecipient(
        fiscalCode,
        messageId as NonEmptyString
      )(), // FIXME: decode instead of cast
      messageModel.getContentFromBlob(blobService, messageId)()
    ]);

    if (E.isLeft(errorOrMaybeDocument)) {
      // the query failed
      return ResponseErrorQuery(
        "Error while retrieving the message",
        errorOrMaybeDocument.left
      );
    }

    const maybeDocument = errorOrMaybeDocument.right;
    if (O.isNone(maybeDocument)) {
      // the document does not exist
      return ResponseErrorNotFound(
        "Message not found",
        "The message that you requested was not found in the system."
      );
    }

    const retrievedMessage = maybeDocument.value;

    if (E.isLeft(errorOrMaybeContent)) {
      context.log.error(
        `GetMessageHandler|${JSON.stringify(errorOrMaybeContent.left)}`
      );
      return ResponseErrorInternal(
        `${errorOrMaybeContent.left.name}: ${errorOrMaybeContent.left.message}`
      );
    }

    const maybeContent = errorOrMaybeContent.right;

    if (O.isNone(maybeContent)) {
      return ResponseErrorNotFound("Not Found", "Message Content Not Found");
    }
    const messageContent = maybeContent.value;

    const maybePaymentData = O.fromNullable(messageContent.payment_data);

    const errorOrMaybePaymentData = await getErrorOrPaymentData(
      context,
      serviceModel,
      redisClient,
      serviceCacheTtl,
      retrievedMessage.senderServiceId,
      maybePaymentData
    );
    if (E.isLeft(errorOrMaybePaymentData)) {
      return errorOrMaybePaymentData.left;
    }

    const publicMessage = retrievedMessageToPublic(retrievedMessage);
    const getErrorOrMaybePublicData = await pipe(
      returnPublicMessage,
      B.fold(
        () => TE.right(O.none),
        () =>
          pipe(
            A.sequenceS(TE.ApplicativePar)({
              messageStatus: pipe(
                messageStatusModel.findLastVersionByModelId([
                  retrievedMessage.id
                ]),
                TE.mapLeft(E.toError),
                TE.chain(
                  TE.fromOption(
                    () => new Error("Cannot find status for message")
                  )
                )
              ),
              service: getOrCacheService(
                retrievedMessage.senderServiceId,
                serviceModel,
                redisClient,
                serviceCacheTtl
              )
            }),
            TE.map(({ messageStatus, service }) =>
              O.some({
                category: pipe(
                  mapMessageCategory(
                    publicMessage,
                    messageContent,
                    categoryFetcher
                  ),
                  category =>
                    category?.tag !== TagEnumPayment.PAYMENT
                      ? category
                      : {
                          rptId: `${messageContent.payment_data.payee
                            ?.fiscal_code ?? service.organizationFiscalCode}${
                            category.noticeNumber
                          }`,
                          tag: TagEnumPayment.PAYMENT
                        }
                ),
                is_archived: messageStatus.isArchived,
                is_read: messageStatus.isRead,
                message_title: messageContent.subject,
                organization_fiscal_code: service.organizationFiscalCode,
                organization_name: service.organizationName,
                service_name: service.serviceName
              })
            ),
            TE.mapLeft(err => ResponseErrorInternal(err.message))
          )
      )
    )();

    if (E.isLeft(getErrorOrMaybePublicData)) {
      return getErrorOrMaybePublicData.left;
    }

    const maybeThirdPartyData = O.fromNullable(messageContent.third_party_data);

    const errorOrMaybeThirdPartyData = await getErrorOrMaybeThirdPartyData(
      context,
      retrievedMessage.senderServiceId,
      serviceToRCConfigurationMap,
      maybeThirdPartyData
    );

    if (E.isLeft(errorOrMaybeThirdPartyData)) {
      return errorOrMaybeThirdPartyData.left;
    }

    const message = withoutUndefinedValues({
      content: {
        ...messageContent,
        payment_data: O.toUndefined(errorOrMaybePaymentData.right),
        third_party_data: O.toUndefined(errorOrMaybeThirdPartyData.right)
      },
      ...publicMessage,
      ...O.toUndefined(getErrorOrMaybePublicData.right)
    });

    const returnedMessage: InternalMessageResponseWithContent = {
      message
    };

    return ResponseSuccessJson(returnedMessage);
  };
}

/**
 * Wraps a GetMessage handler inside an Express request handler.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions, max-params
export function GetMessage(
  messageModel: MessageModel,
  messageStatusModel: MessageStatusModel,
  blobService: BlobService,
  serviceModel: ServiceModel,
  redisClient: RedisClient,
  serviceCacheTtl: NonNegativeInteger,
  serviceToRCConfigurationMap: ReadonlyMap<string, string>,
  categoryFetcher: ThirdPartyDataWithCategoryFetcher
): express.RequestHandler {
  const handler = GetMessageHandler(
    messageModel,
    messageStatusModel,
    blobService,
    serviceModel,
    redisClient,
    serviceCacheTtl,
    serviceToRCConfigurationMap,
    categoryFetcher
  );
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    FiscalCodeMiddleware,
    RequiredParamMiddleware("id", NonEmptyString),
    OptionalQueryParamMiddleware("public_message", BooleanFromString)
  );
  return wrapRequestHandler(middlewaresWrap(handler));
}

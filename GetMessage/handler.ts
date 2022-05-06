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
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
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
import { pipe } from "fp-ts/lib/function";
import { PaymentDataWithRequiredPayee } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentDataWithRequiredPayee";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { MessageResponseWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageResponseWithoutContent";
import { GetMessageResponse } from "@pagopa/io-functions-commons/dist/generated/definitions/GetMessageResponse";
import { PaymentData } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentData";
import { OptionalQueryParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/optional_query_param";
import { BooleanFromString } from "@pagopa/ts-commons/lib/booleans";
import { RedisClient } from "redis";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import * as TE from "fp-ts/lib/TaskEither";
import { TagEnum as TagEnumPayment } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPayment";
import { MessageStatusModel } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { getOrCacheService, mapMessageCategory } from "../utils/messages";
import { CreatedMessageWithoutContent } from "../generated/backend/CreatedMessageWithoutContent";
import { CreatedMessageWithContent } from "../generated/backend/CreatedMessageWithContent";

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
  | IResponseSuccessJson<GetMessageResponse | MessageResponseWithoutContent>
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
  // eslint-disable-next-line max-params
): Promise<E.Either<IResponseErrorInternal, O.Option<PaymentData>>> => {
  if (
    O.isSome(maybePaymentData) &&
    !PaymentDataWithRequiredPayee.is(maybePaymentData.value)
  ) {
    const errorOrSenderService = await getOrCacheService(
      senderServiceId,
      serviceModel,
      redisClient,
      serviceCacheTtl
    )();
    if (E.isLeft(errorOrSenderService)) {
      context.log.error(
        `GetMessageHandler|${JSON.stringify(errorOrSenderService.left)}`
      );
      return E.left(
        ResponseErrorInternal(
          `Cannot get message Sender Service|ERROR=${
            E.toError(errorOrSenderService.left).message
          }`
        )
      );
    }
    const senderService = errorOrSenderService.right;
    return E.right(
      O.some({
        ...maybePaymentData.value,
        payee: {
          fiscal_code: senderService.organizationFiscalCode
        }
      })
    );
  }
  return E.right(maybePaymentData);
};
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
  serviceCacheTtl: NonNegativeInteger
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

    const maybePaymentData = pipe(
      maybeContent,
      O.chainNullableK(content => content.payment_data)
    );

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
                organization_name: service.organizationName,
                service_name: service.serviceName,
                ...pipe(
                  maybeContent,
                  O.map(content => ({
                    category: pipe(
                      mapMessageCategory(publicMessage, content),
                      category =>
                        category?.tag !== TagEnumPayment.PAYMENT
                          ? category
                          : {
                              rptId: `${content.payment_data.payee
                                ?.fiscal_code ??
                                service.organizationFiscalCode}${
                                category.noticeNumber
                              }`,
                              tag: TagEnumPayment.PAYMENT
                            }
                    ),
                    is_archived: messageStatus.isArchived,
                    is_read: messageStatus.isRead,
                    message_title: content.subject
                  })),
                  O.toUndefined
                )
              })
            ),
            TE.mapLeft(err => ResponseErrorInternal(err.message))
          )
      )
    )();

    if (E.isLeft(getErrorOrMaybePublicData)) {
      return getErrorOrMaybePublicData.left;
    }

    const message:
      | CreatedMessageWithContent
      | CreatedMessageWithoutContent = withoutUndefinedValues({
      content: pipe(
        maybeContent,
        O.map(content => ({
          ...content,
          payment_data: O.toUndefined(errorOrMaybePaymentData.right)
        })),
        O.toUndefined
      ),
      ...publicMessage,
      ...O.toUndefined(getErrorOrMaybePublicData.right)
    });

    const returnedMessage:
      | GetMessageResponse
      | MessageResponseWithoutContent = {
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
  serviceCacheTtl: NonNegativeInteger
): express.RequestHandler {
  const handler = GetMessageHandler(
    messageModel,
    messageStatusModel,
    blobService,
    serviceModel,
    redisClient,
    serviceCacheTtl
  );
  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    FiscalCodeMiddleware,
    RequiredParamMiddleware("id", NonEmptyString),
    OptionalQueryParamMiddleware("public_message", BooleanFromString)
  );
  return wrapRequestHandler(middlewaresWrap(handler));
}

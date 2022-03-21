import { Context } from "@azure/functions";
import { CreatedMessageWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/CreatedMessageWithoutContent";
import { EnrichedMessage } from "@pagopa/io-functions-commons/dist/generated/definitions/EnrichedMessage";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { EUCovidCert } from "@pagopa/io-functions-commons/dist/generated/definitions/EUCovidCert";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  Service,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import * as AR from "fp-ts/lib/Array";
import * as RA from "fp-ts/lib/ReadonlyArray";
import * as A from "fp-ts/lib/Apply";
import * as E from "fp-ts/lib/Either";
import { constVoid, pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as T from "fp-ts/lib/Task";
import * as t from "io-ts";
import { MessageCategory } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategory";
import { TagEnum as TagEnumBase } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryBase";
import { TagEnum as TagEnumPayment } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPayment";
import { PaymentData } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentData";
import { RetrievedMessageStatus } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { LegalData } from "../generated/backend/LegalData";

import { MessageStatusExtendedQueryModel } from "../model/message_status_query";
import * as AI from "../utils/AsyncIterableTask";
import { initTelemetryClient } from "./appinsights";
import { createTracker } from "./tracking";

const trackErrorAndContinue = (
  context: Context,
  error: Error,
  kind: "SERVICE" | "CONTENT" | "STATUS",
  fiscalCode: FiscalCode,
  messageId: string,
  serviceId?: ServiceId
  // eslint-disable-next-line max-params
): Error => {
  context.log.error(`Cannot enrich message "${messageId}" | ${error}`);
  createTracker(initTelemetryClient()).messages.trackEnrichmentFailure(
    kind,
    fiscalCode,
    messageId,
    serviceId
  );
  return error;
};

export type CreatedMessageWithoutContentWithStatus = CreatedMessageWithoutContent & {
  readonly is_archived: boolean;
  readonly is_read: boolean;
};

interface IMessageCategoryMapping {
  readonly tag: MessageCategory["tag"];
  readonly pattern: t.Type<Partial<MessageContent>>;
  readonly buildOtherCategoryProperties?: (
    m: CreatedMessageWithoutContent,
    s: Service,
    c: MessageContent
  ) => Record<string, string>;
}

const messageCategoryMappings: ReadonlyArray<IMessageCategoryMapping> = [
  {
    pattern: t.interface({ eu_covid_cert: EUCovidCert }),
    tag: TagEnumBase.EU_COVID_CERT
  },
  {
    pattern: t.interface({ legal_data: LegalData }),
    tag: TagEnumBase.LEGAL_MESSAGE
  },
  {
    buildOtherCategoryProperties: (_, s, c): Record<string, string> => ({
      rptId: `${s.organizationFiscalCode}${c.payment_data.notice_number}`
    }),
    pattern: t.interface({ payment_data: PaymentData }),
    tag: TagEnumPayment.PAYMENT
  }
];

export const mapMessageCategory = (
  message: CreatedMessageWithoutContent,
  service: Service,
  messageContent: MessageContent
): MessageCategory =>
  pipe(
    messageCategoryMappings,
    AR.map(mapping =>
      pipe(
        messageContent,
        mapping.pattern.decode,
        E.fold(constVoid, () => ({
          tag: mapping.tag,
          ...pipe(
            O.fromNullable(mapping.buildOtherCategoryProperties),
            O.fold(
              () => ({}),
              f => f(message, service, messageContent)
            )
          )
        }))
      )
    ),
    AR.filter(MessageCategory.is),
    AR.head,
    O.getOrElse(() => ({ tag: TagEnumBase.GENERIC }))
  );

/**
 * This function enrich a CreatedMessageWithoutContent with
 * service's details and message's subject.
 *
 * @param messageModel
 * @param serviceModel
 * @param blobService
 * @returns
 */
export const enrichMessagesData = (
  context: Context,
  messageModel: MessageModel,
  serviceModel: ServiceModel,
  blobService: BlobService
) => (
  messages: ReadonlyArray<CreatedMessageWithoutContentWithStatus>
  // eslint-disable-next-line functional/prefer-readonly-type, @typescript-eslint/array-type
): Promise<E.Either<Error, EnrichedMessage>>[] =>
  messages.map(message =>
    pipe(
      {
        content: pipe(
          messageModel.getContentFromBlob(blobService, message.id),
          TE.map(O.toUndefined),
          TE.mapLeft(e =>
            trackErrorAndContinue(
              context,
              e,
              "CONTENT",
              message.fiscal_code,
              message.id
            )
          )
        ),
        service: pipe(
          serviceModel.findLastVersionByModelId([message.sender_service_id]),
          TE.mapLeft(
            e => new Error(`${e.kind}, ServiceId=${message.sender_service_id}`)
          ),
          TE.chain(
            TE.fromOption(
              () =>
                new Error(
                  `EMPTY_SERVICE, ServiceId=${message.sender_service_id}`
                )
            )
          ),
          TE.mapLeft(e =>
            trackErrorAndContinue(
              context,
              e,
              "SERVICE",
              message.fiscal_code,
              message.id,
              message.sender_service_id
            )
          )
        )
      },
      A.sequenceS(TE.ApplicativePar),
      TE.map(({ service, content }) => ({
        ...message,
        category: mapMessageCategory(message, service, content),
        message_title: content.subject,
        organization_name: service.organizationName,
        service_name: service.serviceName
      }))
    )()
  );

const getMessageStatusLastVersion = (
  messageStatusModel: MessageStatusExtendedQueryModel,
  messageIds: ReadonlyArray<NonEmptyString>
): TE.TaskEither<Error, Record<NonEmptyString, RetrievedMessageStatus>> =>
  pipe(
    messageIds,
    ids => messageStatusModel.findAllVersionsByModelIdIn(ids),
    AI.fromAsyncIterator,
    AI.foldTaskEither(_ => new Error(`Error retrieving data from cosmos.`)),
    TE.map(RA.flatten),
    TE.chainW(_ => {
      const lefts = RA.lefts(_);
      return lefts.length > 0
        ? TE.left<Error, ReadonlyArray<RetrievedMessageStatus>>(
            new Error(`${lefts.length} service(s) with decoding errors found.`)
          )
        : TE.of<Error, ReadonlyArray<RetrievedMessageStatus>>(RA.rights(_));
    }),
    TE.map(
      RA.reduce({} as Record<string, RetrievedMessageStatus>, (acc, val) => {
        if (!acc[val.messageId] || acc[val.messageId].version < val.version) {
          // eslint-disable-next-line functional/immutable-data
          acc[val.messageId] = val;
        }
        return acc;
      })
    )
  );

/**
 * This function enrich a CreatedMessageWithoutContent with
 * message status details
 *
 * @param messageModel
 * @param serviceModel
 * @param blobService
 * @returns
 */
export const enrichMessagesStatus = (
  context: Context,
  messageStatusModel: MessageStatusExtendedQueryModel
) => (
  messages: ReadonlyArray<CreatedMessageWithoutContent>
  // eslint-disable-next-line functional/prefer-readonly-type,  @typescript-eslint/array-type
): T.Task<E.Either<Error, CreatedMessageWithoutContentWithStatus>[]> =>
  pipe(
    messages.map(message => message.id as NonEmptyString),
    ids => getMessageStatusLastVersion(messageStatusModel, ids),
    TE.mapLeft(error => {
      context.log.error(`Cannot enrich message status | ${error}`);
      return messages.map(_m => E.left(error));
    }),
    TE.map(lastMessageStatusPerMessage =>
      messages.map(m =>
        E.of({
          ...m,
          is_archived: lastMessageStatusPerMessage[m.id].isArchived,
          is_read: lastMessageStatusPerMessage[m.id].isRead
        })
      )
    ),
    TE.toUnion
  );

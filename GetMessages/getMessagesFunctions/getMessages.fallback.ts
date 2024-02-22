import { Context } from "@azure/functions";
import { BlobService } from "azure-storage";
import * as AP from "fp-ts/lib/Apply";
import * as O from "fp-ts/lib/Option";
import {
  asyncIteratorToPageArray,
  flattenAsyncIterator,
  mapAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import { retrievedMessageToPublic } from "@pagopa/io-functions-commons/dist/src/utils/messages";
import { toPageResults } from "@pagopa/io-functions-commons/dist/src/utils/paging";
import {
  MessageModel,
  RetrievedMessage
} from "@pagopa/io-functions-commons/dist/src/models/message";
import { CreatedMessageWithoutContent } from "@pagopa/io-functions-commons/dist/generated/definitions/CreatedMessageWithoutContent";
import * as A from "fp-ts/lib/Array";
import * as E from "fp-ts/lib/Either";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";

import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import {
  CreatedMessageWithoutContentWithStatus,
  computeFlagFromHasPrecondition,
  enrichMessagesStatus,
  mapMessageCategory,
  trackErrorAndContinue
} from "../../utils/messages";
import { MessageStatusExtendedQueryModel } from "../../model/message_status_query";
import { ThirdPartyDataWithCategoryFetcher } from "../../utils/messages";
import RCConfigurationUtility from "../../utils/remoteContentConfig";
import { IGetMessagesFunction, IPageResult } from "./getMessages.selector";
import { EnrichedMessageWithContent } from "./models";

type RetrievedNotPendingMessage = t.TypeOf<typeof RetrievedNotPendingMessage>;
const RetrievedNotPendingMessage = t.intersection([
  RetrievedMessage,
  t.interface({ isPending: t.literal(false) })
]);

const filterMessages = (shouldGetArchivedMessages: boolean) => (
  // eslint-disable-next-line functional/prefer-readonly-type, @typescript-eslint/array-type
  messages: E.Either<Error, CreatedMessageWithoutContentWithStatus>[]
  // eslint-disable-next-line functional/prefer-readonly-type, @typescript-eslint/array-type
): E.Either<Error, CreatedMessageWithoutContentWithStatus>[] =>
  pipe(
    messages,
    A.filter(
      flow(
        // never filter away errors
        E.mapLeft(() => true),
        E.map(mess => mess.is_archived === shouldGetArchivedMessages),
        E.toUnion
      )
    )
  );

export const getHasPreconditionFlagForMessagesFallback = (
  content: MessageContent,
  message: EnrichedMessageWithContent,
  rcConfigurationUtility: RCConfigurationUtility
): TE.TaskEither<Error, EnrichedMessageWithContent> =>
  pipe(
    O.fromNullable(content.third_party_data),
    O.map(thirdPartyData =>
      pipe(
        O.fromNullable(thirdPartyData.has_precondition),
        O.fold(
          () =>
            pipe(
              rcConfigurationUtility.getOrCacheRCConfigurationWithFallback(
                message.sender_service_id,
                thirdPartyData.configuration_id
              ),
              TE.map(serviceConfig => serviceConfig.hasPrecondition)
            ),
          hasPrecondition => TE.of(hasPrecondition)
        ),
        TE.map(hasPrecondition =>
          computeFlagFromHasPrecondition(hasPrecondition, message.is_read)
        ),
        TE.map(hasPrecondition => ({
          ...message,
          has_precondition: hasPrecondition
        }))
      )
    ),
    O.getOrElse(() =>
      TE.of({
        ...message,
        has_precondition: false
      })
    )
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
export const enrichContentData = (
  context: Context,
  messageModel: MessageModel,
  blobService: BlobService,
  rcConfigurationUtility: RCConfigurationUtility,
  categoryFetcher: ThirdPartyDataWithCategoryFetcher
  // eslint-disable-next-line max-params
) => (
  messages: ReadonlyArray<CreatedMessageWithoutContentWithStatus>
  // eslint-disable-next-line functional/prefer-readonly-type, @typescript-eslint/array-type
): Promise<E.Either<Error, EnrichedMessageWithContent>>[] =>
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
        )
      },
      AP.sequenceS(TE.ApplicativePar),
      TE.map(({ content }) => ({
        content,
        enrichedMessage: {
          ...message,
          category: mapMessageCategory(message, content, categoryFetcher),
          has_attachments: content.legal_data?.has_attachment ?? false,
          has_remote_content:
            content.third_party_data?.has_remote_content ?? false,
          id: message.id as NonEmptyString,
          message_title: content.subject
        }
      })),
      TE.chain(({ content, enrichedMessage }) =>
        getHasPreconditionFlagForMessagesFallback(
          content,
          enrichedMessage,
          rcConfigurationUtility
        )
      )
    )()
  );

export const getMessagesFromFallback = (
  messageModel: MessageModel,
  messageStatusModel: MessageStatusExtendedQueryModel,
  blobService: BlobService,
  rcConfigurationUtility: RCConfigurationUtility,
  categoryFetcher: ThirdPartyDataWithCategoryFetcher
): IGetMessagesFunction => ({
  context,
  fiscalCode,
  pageSize,
  shouldEnrichResultData,
  shouldGetArchivedMessages,
  maximumId,
  minimumId
}): TE.TaskEither<
  CosmosErrors | Error,
  IPageResult<EnrichedMessageWithContent>
> =>
  pipe(
    messageModel.findMessages(fiscalCode, pageSize, maximumId, minimumId),
    TE.map(i => mapAsyncIterator(i, A.rights)),
    TE.map(i => mapAsyncIterator(i, A.filter(RetrievedNotPendingMessage.is))),
    TE.map(i => mapAsyncIterator(i, A.map(retrievedMessageToPublic))),
    TE.chainW(i =>
      // check whether we should enrich messages or not
      pipe(
        TE.fromPredicate(
          () => shouldEnrichResultData === true,
          () =>
            // if no enrichment is requested we just wrap messages
            mapAsyncIterator(
              i,
              A.map(async e => E.right<Error, CreatedMessageWithoutContent>(e))
            )
        )(i),
        TE.map(j =>
          mapAsyncIterator(j, async m =>
            enrichMessagesStatus(context, messageStatusModel)(m)()
          )
        ),
        TE.map(j =>
          mapAsyncIterator(j, filterMessages(shouldGetArchivedMessages))
        ),
        TE.map(j =>
          mapAsyncIterator(j, x => [
            // Do not enrich messages if errors occurred
            ...pipe(
              A.lefts(x),
              A.map(async y => E.left(y))
            ),
            ...pipe(
              A.rights(x),
              enrichContentData(
                context,
                messageModel,
                blobService,
                rcConfigurationUtility,
                categoryFetcher
              )
            )
          ])
        ),
        // we need to make a TaskEither of the Either[] mapped above
        TE.orElse(TE.of),
        TE.map(flattenAsyncIterator),
        TE.chain(_ =>
          TE.tryCatch(() => asyncIteratorToPageArray(_, pageSize), E.toError)
        ),
        TE.chain(
          TE.fromPredicate(
            page => !page.results.some(E.isLeft),
            () => new Error("Cannot enrich data")
          )
        ),
        TE.map(({ hasMoreResults, results }) =>
          toPageResults(A.rights([...results]), hasMoreResults)
        ),
        // cast is needed because PageResults returns an incomplete type
        TE.map(paginatedItems => ({
          ...paginatedItems,
          items: paginatedItems.items as ReadonlyArray<
            EnrichedMessageWithContent
          >
        }))
      )
    )
  );

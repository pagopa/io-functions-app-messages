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
import { BlobService } from "azure-storage";

import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { RedisClient } from "redis";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  CreatedMessageWithoutContentWithStatus,
  enrichContentData,
  enrichMessagesStatus
} from "../../utils/messages";
import { MessageStatusExtendedQueryModel } from "../../model/message_status_query";
import { ThirdPartyDataWithCategoryFetcher } from "../../utils/messages";
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

export const getMessagesFromFallback = (
  messageModel: MessageModel,
  messageStatusModel: MessageStatusExtendedQueryModel,
  blobService: BlobService,
  remoteContentConfigurationModel: RemoteContentConfigurationModel,
  redisClient: RedisClient,
  remoteContentConfigurationTtl: NonNegativeInteger,
  categoryFetcher: ThirdPartyDataWithCategoryFetcher
  // eslint-disable-next-line max-params
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
                redisClient,
                remoteContentConfigurationModel,
                remoteContentConfigurationTtl,
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

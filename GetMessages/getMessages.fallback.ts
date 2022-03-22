import {
  asyncIteratorToPageArray,
  flattenAsyncIterator,
  mapAsyncIterator
} from "@pagopa/io-functions-commons/dist/src/utils/async";
import { retrievedMessageToPublic } from "@pagopa/io-functions-commons/dist/src/utils/messages";
import {
  PageResults,
  toPageResults
} from "@pagopa/io-functions-commons/dist/src/utils/paging";
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
import { ServiceModel } from "@pagopa/io-functions-commons/dist/src/models/service";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import { Context } from "@azure/functions";
import { RedisClient } from "redis";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import {
  CreatedMessageWithoutContentWithStatus,
  enrichMessagesData,
  enrichMessagesStatus
} from "../utils/messages";
import { MessageStatusExtendedQueryModel } from "../model/message_status_query";

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

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type GetMessagesParams = {
  readonly context: Context;
  readonly fiscalCode: FiscalCode;
  readonly pageSize: NonNegativeInteger;
  readonly shouldEnrichResultData: boolean;
  readonly shouldGetArchivedMessages: boolean;
  readonly maximumId: NonEmptyString;
  readonly minimumId: NonEmptyString;
};

export const getMessagesFromFallback = (
  messageModel: MessageModel,
  messageStatusModel: MessageStatusExtendedQueryModel,
  serviceModel: ServiceModel,
  blobService: BlobService,
  redisClient: RedisClient,
  serviceCacheTtl: NonNegativeInteger
  // eslint-disable-next-line  max-params
) => ({
  context,
  fiscalCode,
  pageSize,
  shouldEnrichResultData,
  shouldGetArchivedMessages,
  maximumId,
  minimumId
}: GetMessagesParams): TE.TaskEither<CosmosErrors | Error, PageResults> =>
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
              enrichMessagesData(
                context,
                messageModel,
                serviceModel,
                blobService,
                redisClient,
                serviceCacheTtl
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
        )
      )
    )
  );

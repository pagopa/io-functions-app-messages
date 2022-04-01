import * as t from "io-ts";

import * as TE from "fp-ts/TaskEither";

import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import { defaultPageSize } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  MessageViewModel as MessageViewModelBase,
  RetrievedMessageView
} from "@pagopa/io-functions-commons/dist/src/models/message_view";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";

/**
 * Extends MessageStatusModel with query in operation
 */
export class MessageViewExtendedQueryModel extends MessageViewModelBase {
  /**
   * Build a Cosmos query iterator for messages with a min and max message id.
   */
  public queryPage(
    fiscalCode: FiscalCode,
    getArchived: boolean,
    maximumMessageId?: NonEmptyString,
    minimumMessageId?: NonEmptyString,
    pageSize = defaultPageSize
  ): TE.TaskEither<
    CosmosErrors,
    AsyncIterable<ReadonlyArray<t.Validation<RetrievedMessageView>>>
  > {
    return TE.tryCatch(
      async () =>
        this.getQueryIterator(
          {
            parameters: [
              {
                name: "@fiscalCode",
                value: fiscalCode
              },
              {
                name: "@archived",
                value: getArchived
              },
              {
                name: "@maximumId",
                value: maximumMessageId
              },
              {
                name: "@minimumId",
                value: minimumMessageId
              }
            ],
            query: `SELECT * FROM m WHERE m.fiscalCode = @fiscalCode 
                AND m.status.archived = @archived
                AND ((NOT IS_DEFINED(@maximumId)) OR m.id < @maximumId)
                AND ((NOT IS_DEFINED(@minimumId)) OR m.id > @minimumId)
                ORDER BY m.fiscalCode, m.id DESC, m.status.archived`
          },
          {
            maxItemCount: pageSize,
            populateQueryMetrics: true
          }
        ),
      toCosmosErrorResponse
    );
  }
}

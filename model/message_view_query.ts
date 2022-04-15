import * as t from "io-ts";

import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/function";

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

const emptyMessageParameter = {
  condition: "",
  parameters: []
};

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
    return pipe(
      {
        parameters: [
          {
            name: "@fiscalCode",
            value: fiscalCode
          },
          {
            name: "@archived",
            value: getArchived
          }
        ],
        query: `SELECT * FROM m WHERE m.fiscalCode = @fiscalCode AND m.status.archived = @archived`
      },
      TE.of,
      TE.bindTo("commonQuerySpec"),
      TE.bind("nextMessagesParams", () =>
        pipe(
          O.fromNullable(maximumMessageId),
          O.foldW(
            () => emptyMessageParameter,
            maximumId => ({
              condition: ` AND m.id < @maxId`,
              parameters: [{ name: "@maxId", value: maximumId }]
            })
          ),
          TE.of
        )
      ),
      TE.bind("prevMessagesParams", () =>
        pipe(
          O.fromNullable(minimumMessageId),
          O.foldW(
            () => emptyMessageParameter,
            minimumId => ({
              condition: ` AND m.id > @minId`,
              parameters: [{ name: "@minId", value: minimumId }]
            })
          ),
          TE.of
        )
      ),
      TE.chain(({ commonQuerySpec, nextMessagesParams, prevMessagesParams }) =>
        TE.tryCatch(
          async () =>
            this.getQueryIterator(
              {
                parameters: [
                  ...commonQuerySpec.parameters,
                  ...nextMessagesParams.parameters,
                  ...prevMessagesParams.parameters
                ],
                query: `${commonQuerySpec.query}${nextMessagesParams.condition}${prevMessagesParams.condition} 
                ORDER BY m.fiscalCode, m.id DESC, m.status.archived`
              },
              {
                maxItemCount: pageSize
              }
            ),
          toCosmosErrorResponse
        )
      )
    );
  }
}

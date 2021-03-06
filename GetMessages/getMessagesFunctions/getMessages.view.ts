import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as RA from "fp-ts/lib/ReadonlyArray";

import { flattenAsyncIterable } from "@pagopa/io-functions-commons/dist/src/utils/async";

import { defaultPageSize } from "@pagopa/io-functions-commons/dist/src/models/message";

import { toPageResults } from "@pagopa/io-functions-commons/dist/src/utils/paging";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { RetrievedMessageView } from "@pagopa/io-functions-commons/dist/src/models/message_view";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { TagEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryBase";
import { TagEnum as TagEnumPayment } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPayment";
import * as AI from "../../utils/AsyncIterableTask";

import { MessageViewExtendedQueryModel } from "../../model/message_view_query";
import { ThirdPartyDataWithCategoryFetcher } from "../../utils/messages";
import { EnrichedMessageWithContent, InternalMessageCategory } from "./models";
import { IGetMessagesFunction, IPageResult } from "./getMessages.selector";

export const getMessagesFromView = (
  messageViewModel: MessageViewExtendedQueryModel,
  categoryFetcher: ThirdPartyDataWithCategoryFetcher
): IGetMessagesFunction => ({
  context,
  fiscalCode,
  shouldGetArchivedMessages,
  maximumId,
  minimumId,
  pageSize = defaultPageSize
}): TE.TaskEither<
  CosmosErrors | Error,
  IPageResult<EnrichedMessageWithContent>
> =>
  pipe(
    messageViewModel.queryPage(fiscalCode, maximumId, minimumId, pageSize),
    TE.mapLeft(err => {
      context.log.error(
        `getMessagesFromView|Error building queryPage iterator`
      );

      return err;
    }),
    TE.chain(
      flow(
        AI.fromAsyncIterable,
        AI.map(RA.rights),
        AI.map(
          RA.filter(
            message => message.status.archived === shouldGetArchivedMessages
          )
        ),
        AI.mapIterable(flattenAsyncIterable),
        AI.toPageArray(toCosmosErrorResponse, pageSize),
        TE.map(({ hasMoreResults, results }) =>
          toPageResults(results, hasMoreResults)
        ),
        TE.map(paginatedItems => ({
          ...paginatedItems,
          items: (paginatedItems.items as ReadonlyArray<
            RetrievedMessageView
          >).map(
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            toEnrichedMessageWithContent(categoryFetcher)
          )
        })),
        TE.mapLeft(err => {
          context.log.error(
            `getMessagesFromView|Error retrieving page data from cosmos|${err.error.message}`
          );

          return err;
        })
      )
    )
  );

/**
 * Map `RetrievedMessageView` to `EnrichedMessageWithContent`
 */
export const toEnrichedMessageWithContent = (
  categoryFetcher: ThirdPartyDataWithCategoryFetcher
) => (item: RetrievedMessageView): EnrichedMessageWithContent => ({
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  category: toCategory(categoryFetcher)(item),
  created_at: item.createdAt,
  fiscal_code: item.fiscalCode,
  has_attachments: item.components.attachments.has,
  id: item.id,
  is_archived: item.status.archived,
  is_read: item.status.read,
  message_title: item.messageTitle,
  sender_service_id: item.senderServiceId,
  time_to_live: item.timeToLive
});

/**
 * Map components to `InternalMessageCategory`
 */
const toCategory = (categoryFetcher: ThirdPartyDataWithCategoryFetcher) => ({
  components,
  senderServiceId
}: RetrievedMessageView): InternalMessageCategory =>
  components.euCovidCert.has
    ? { tag: TagEnum.EU_COVID_CERT }
    : components.legalData.has
    ? { tag: TagEnum.LEGAL_MESSAGE }
    : components.thirdParty.has
    ? {
        has_attachments: components.thirdParty.has_attachments,
        id: components.thirdParty.id,
        original_receipt_date: components.thirdParty.original_receipt_date,
        original_sender: components.thirdParty.original_sender,
        summary: components.thirdParty.summary,
        tag: categoryFetcher(senderServiceId).category
      }
    : components.payment.has
    ? {
        // Ignore ts error since we've already checked payment.has to be true
        noticeNumber: (components.payment
          .notice_number as unknown) as NonEmptyString,
        tag: TagEnumPayment.PAYMENT
      }
    : { tag: TagEnum.GENERIC };

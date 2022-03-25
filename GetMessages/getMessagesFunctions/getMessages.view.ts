import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as RA from "fp-ts/lib/ReadonlyArray";

import { RetrievedMessageView } from "@pagopa/io-functions-commons/dist/src/models/message_view";
import { defaultPageSize } from "@pagopa/io-functions-commons/dist/src/models/message";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";

import * as AI from "../../utils/AsyncIterableTask";

import { MessageViewExtendedQueryModel } from "../../model/message_view_query";

export const getMessages = (
  messageViewModel: MessageViewExtendedQueryModel,
  fiscalCode: FiscalCode,
  getArchived: boolean,
  maximumMessageId?: NonEmptyString,
  minimumMessageId?: NonEmptyString,
  pageSize = defaultPageSize
  // eslint-disable-next-line max-params
): TE.TaskEither<Error, ReadonlyArray<RetrievedMessageView>> =>
  pipe(
    messageViewModel.queryPage(
      fiscalCode,
      getArchived,
      maximumMessageId,
      minimumMessageId,
      pageSize
    ),
    AI.fromAsyncIterable,
    AI.map(RA.rights),
    AI.foldTaskEither(_ => new Error(`Error retrieving data from cosmos.`)),
    TE.map(RA.flatten)
  );

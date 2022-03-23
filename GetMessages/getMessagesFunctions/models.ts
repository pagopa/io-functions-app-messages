import * as t from "io-ts";

import { MessageCategory } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategory";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { DateFromTimestamp } from "@pagopa/ts-commons/lib/dates";
import { withDefault } from "@pagopa/ts-commons/lib/types";

import { TimeToLiveSeconds } from "../../generated/backend/TimeToLiveSeconds";

// required attributes
const EnrichedMessageWithContentR = t.interface({
  /* eslint-disable sort-keys */
  id: NonEmptyString,
  fiscal_code: FiscalCode,
  created_at: DateFromTimestamp,
  sender_service_id: ServiceId,
  message_title: t.string,
  is_read: t.boolean,
  is_archived: t.boolean
  /* eslint-enable sort-keys */
});

// optional attributes
const EnrichedMessageWithContentO = t.partial({
  /* eslint-disable sort-keys */
  time_to_live: TimeToLiveSeconds,
  category: MessageCategory,
  has_attachments: withDefault(t.boolean, false)
  /* eslint-enable sort-keys */
});

export const EnrichedMessageWithContent = t.exact(
  t.intersection(
    [EnrichedMessageWithContentR, EnrichedMessageWithContentO],
    "EnrichedMessage"
  )
);

export type EnrichedMessageWithContent = t.TypeOf<
  typeof EnrichedMessageWithContent
>;

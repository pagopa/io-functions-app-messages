/* eslint-disable sort-keys */
import * as t from "io-ts";

import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import {
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import { DateFromTimestamp } from "@pagopa/ts-commons/lib/dates";
import { enumType, withDefault } from "@pagopa/ts-commons/lib/types";

import { TagEnum as TagEnumPayment } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPayment";
import { MessageCategoryBase } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryBase";
import { MessageCategoryPN } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPN";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";

// ---------------------------------------
// ---------------------------------------

export const InternalMessageCategoryPayment = t.exact(
  t.intersection([
    t.interface({
      tag: enumType<TagEnumPayment>(TagEnumPayment, "tag"),
      noticeNumber: NonEmptyString
    }),
    t.partial({
      payeeFiscalCode: OrganizationFiscalCode
    })
  ]),
  "MessageCategoryPayment"
);

export type InternalMessageCategoryPayment = t.TypeOf<
  typeof InternalMessageCategoryPayment
>;

// ---------------------------------------
// ---------------------------------------

export const InternalMessageCategory = t.union(
  [InternalMessageCategoryPayment, MessageCategoryBase, MessageCategoryPN],
  "MessageCategory"
);

export type InternalMessageCategory = t.TypeOf<typeof InternalMessageCategory>;

// ---------------------------------------
// ---------------------------------------

// required attributes
const EnrichedMessageWithContentR = t.interface({
  id: NonEmptyString,
  fiscal_code: FiscalCode,
  created_at: DateFromTimestamp,
  sender_service_id: ServiceId,
  message_title: t.string,
  is_read: t.boolean,
  is_archived: t.boolean
});

// optional attributes
const EnrichedMessageWithContentO = t.partial({
  time_to_live: TimeToLiveSeconds,
  category: InternalMessageCategory,
  has_attachments: withDefault(t.boolean, false)
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

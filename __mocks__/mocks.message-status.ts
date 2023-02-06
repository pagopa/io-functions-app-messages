import { NotRejectedMessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotRejectedMessageStatusValue";
import {
  MessageStatus,
  RetrievedMessageStatus
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { CosmosResource } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { aFiscalCode } from "./mocks";

export const aMessageId = "aMessageId" as NonEmptyString;

// CosmosResourceMetadata
export const aCosmosResourceMetadata: Omit<CosmosResource, "id"> = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};

export const aMessageStatus: MessageStatus = {
  messageId: aMessageId,
  status: NotRejectedMessageStatusValueEnum.PROCESSED,
  updatedAt: new Date(),
  isArchived: false,
  isRead: false
};

export const aRetrievedMessageStatus: RetrievedMessageStatus = {
  ...aCosmosResourceMetadata,
  ...aMessageStatus,
  fiscalCode: aFiscalCode,
  version: 0 as NonNegativeInteger,
  id: "aMessageStatusId" as NonEmptyString,
  kind: "IRetrievedMessageStatus"
};

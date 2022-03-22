import {
  MESSAGE_STATUS_MODEL_PK_FIELD,
  MessageStatusModel as MessageStatusModelBase,
  RetrievedMessageStatus
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import * as t from "io-ts";
import * as DocumentDbUtils from "./utils/documentdb";

/**
 * Extends MessageStatusModel with query in operation
 */
export class MessageStatusExtendedQueryModel extends MessageStatusModelBase {
  /**
   * Retrieves a list of every version of the requested model list
   *
   * @param modelId
   */
  public findAllVersionsByModelIdIn(
    partitionKeyList: ReadonlyArray<string>
  ): AsyncIterator<ReadonlyArray<t.Validation<RetrievedMessageStatus>>> {
    return DocumentDbUtils.findAllVersionsByModelIdIn(
      this.container,
      this.retrievedItemT,
      MESSAGE_STATUS_MODEL_PK_FIELD,
      partitionKeyList
    )[Symbol.asyncIterator]();
  }
}

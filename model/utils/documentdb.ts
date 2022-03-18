import { Container } from "@azure/cosmos";
import { mapAsyncIterable } from "@pagopa/io-functions-commons/dist/src/utils/async";
import * as t from "io-ts";

/**
 * Find all versions of a document.
 *
 * Pass the partitionKey field / values if it differs from the modelId
 * to avoid multi-partition queries.
 */
// eslint-disable-next-line max-params, prefer-arrow/prefer-arrow-functions
export function findAllVersionsByModelIdIn<TR>(
  container: Container,
  retrievedItemType: t.Type<TR, unknown, unknown>,
  partitionKeyField: string,
  partitionKeyList: ReadonlyArray<string>
): AsyncIterable<ReadonlyArray<t.Validation<TR>>> {
  const iterator = container.items
    .query({
      parameters: [
        {
          name: "@partitionKeyList",
          value: partitionKeyList
        }
      ],
      query: `SELECT * FROM m WHERE ARRAY_CONTAINS(@partitionKeyList, m.${partitionKeyField})`
    })
    .getAsyncIterator();
  return mapAsyncIterable(iterator, feedResponse =>
    feedResponse.resources.map(retrievedItemType.decode)
  );
}

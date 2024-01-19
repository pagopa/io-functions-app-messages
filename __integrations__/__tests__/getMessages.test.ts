/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable sort-keys */
import { CosmosClient, Database } from "@azure/cosmos";
import { createBlobService } from "azure-storage";

import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/function";

import { PaginatedPublicMessagesCollection } from "@pagopa/io-functions-commons/dist/generated/definitions/PaginatedPublicMessagesCollection";
import { retrievedMessageToPublic } from "@pagopa/io-functions-commons/dist/src/utils/messages";

import { RetrievedMessage } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  createCosmosDbAndCollections,
  fillMessages,
  fillMessagesStatus,
  fillMessagesView,
  fillRemoteContent,
  fillServices,
  setMessagesAsArchived,
  setMessagesViewAsArchived
} from "../__mocks__/fixtures";

import {
  aFiscalCodeWithMessages,
  aFiscalCodeWithMessagesWithThirdParty,
  aFiscalCodeWithoutMessages,
  messagesList,
  messageStatusList,
  messagesWithoutThirdPartyDataList,
  mockEnrichMessage
} from "../__mocks__/mock.messages";
import {
  aRemoteContentConfigurationList,
  serviceList
} from "../__mocks__/mock.services";
import { createBlobs } from "../__mocks__/utils/azure_storage";
import { getNodeFetch } from "../utils/fetch";
import { getMessages, getMessagesWithEnrichment } from "../utils/client";

import {
  WAIT_MS,
  COSMOSDB_URI,
  REMOTE_CONTENT_COSMOSDB_URI,
  REMOTE_CONTENT_COSMOSDB_KEY,
  REMOTE_CONTENT_COSMOSDB_NAME,
  COSMOSDB_KEY,
  COSMOSDB_NAME,
  QueueStorageConnection,
  MESSAGE_CONTAINER_NAME,
  FF_TYPE
} from "../env";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

const MAX_ATTEMPT = 50;

jest.setTimeout(WAIT_MS * MAX_ATTEMPT);

const baseUrl = "http://function:7071";
const fetch = getNodeFetch();

// ----------------
// Setup dbs
// ----------------

const blobService = createBlobService(QueueStorageConnection);

const cosmosClient = new CosmosClient({
  endpoint: COSMOSDB_URI,
  key: COSMOSDB_KEY
});

const remoteContentCosmosClient = new CosmosClient({
  endpoint: REMOTE_CONTENT_COSMOSDB_URI,
  key: REMOTE_CONTENT_COSMOSDB_KEY
});

// eslint-disable-next-line functional/no-let
let cosmosdb: Database;
let rccosmosdb: Database;

// Wait some time
beforeAll(async () => {
  const dbTuple = await pipe(
    createCosmosDbAndCollections(
      { client: cosmosClient, cosmosDbName: COSMOSDB_NAME },
      O.some({
        client: remoteContentCosmosClient,
        cosmosDbName: REMOTE_CONTENT_COSMOSDB_NAME
      })
    ),
    TE.getOrElse(() => {
      throw Error("Cannot create db");
    })
  )();

  cosmosdb = dbTuple.cosmosdb;
  rccosmosdb = dbTuple.rccosmosdb;

  await pipe(
    createBlobs(blobService, [MESSAGE_CONTAINER_NAME]),
    TE.getOrElse(() => {
      throw Error("Cannot create azure storage");
    })
  )();

  await fillMessages(cosmosdb, blobService, messagesList);
  await fillMessagesStatus(cosmosdb, messageStatusList);
  await fillMessagesView(cosmosdb, messagesList, messageStatusList);
  await fillServices(cosmosdb, serviceList);
  await fillRemoteContent(rccosmosdb, aRemoteContentConfigurationList);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// -------------------------
// Tests
// -------------------------

describe("Get Messages |> Middleware errors", () => {
  it("should return 400 when creating a message from a non existing Service", async () => {
    const response = await getMessages(fetch, baseUrl)();
    expect(response.status).toEqual(400);
  });
});

// No Enrichment tests are only valid if FF_TYPE is "none"
if (FF_TYPE === "none") {
  describe("Get Messages |> Success Results, No Enrichment", () => {
    it.each`
      fiscalCode                    | expectedItems                        | expectedPrev                                | expectedNext
      ${aFiscalCodeWithoutMessages} | ${[]}                                | ${undefined}                                | ${undefined}
      ${aFiscalCodeWithMessages}    | ${messagesWithoutThirdPartyDataList} | ${messagesWithoutThirdPartyDataList[0]?.id} | ${messagesWithoutThirdPartyDataList[9]?.id}
    `(
      "should return and empty list when user has no messages",
      async ({ fiscalCode, expectedItems, expectedPrev, expectedNext }) => {
        const response = await getMessages(fetch, baseUrl)(fiscalCode);
        expect(response.status).toEqual(200);

        const body = (await response.json()) as PaginatedPublicMessagesCollection;

        // strip away undefind properties by stringify/parsing to JSON
        const expected = JSON.parse(
          JSON.stringify({
            items: (expectedItems as ReadonlyArray<RetrievedMessage>).map(
              retrievedMessageToPublic
            ),
            prev: expectedPrev,
            next: expectedNext
          })
        );

        expect(body).toEqual(expected);
      }
    );
  });
}

describe("Get Messages |> Success Results, With Enrichment", () => {
  it.each`
    title                                                                             | fiscalCode                    | messagesArchived        | retrieveArchived | pageSize | maximum_id                                 | expectedItems                                     | expectedPrev                                | expectedNext
    ${"should return and empty list when user has no messages"}                       | ${aFiscalCodeWithoutMessages} | ${[]}                   | ${undefined}     | ${5}     | ${undefined}                               | ${[]}                                             | ${undefined}                                | ${undefined}
    ${"should return first page "}                                                    | ${aFiscalCodeWithMessages}    | ${[]}                   | ${undefined}     | ${5}     | ${undefined}                               | ${messagesList.slice(0, 5)}                       | ${messagesList[0]?.id}                      | ${messagesList[4]?.id}
    ${"should return second page"}                                                    | ${aFiscalCodeWithMessages}    | ${[]}                   | ${undefined}     | ${5}     | ${messagesWithoutThirdPartyDataList[4].id} | ${messagesWithoutThirdPartyDataList.slice(5, 10)} | ${messagesWithoutThirdPartyDataList[5]?.id} | ${messagesWithoutThirdPartyDataList[9]?.id}
    ${"should return and empty list when user has no archived messages"}              | ${aFiscalCodeWithMessages}    | ${[]}                   | ${true}          | ${5}     | ${undefined}                               | ${[]}                                             | ${undefined}                                | ${undefined}
    ${"should return only archived messages "}                                        | ${aFiscalCodeWithMessages}    | ${[messagesList[0].id]} | ${true}          | ${5}     | ${undefined}                               | ${messagesList.slice(0, 1)}                       | ${messagesList[0]?.id}                      | ${undefined}
    ${"should return only not archived messages when 'archived' flag is not present"} | ${aFiscalCodeWithMessages}    | ${[messagesList[0].id]} | ${undefined}     | ${5}     | ${undefined}                               | ${messagesList.slice(1, 6)}                       | ${messagesList[1]?.id}                      | ${messagesList[5]?.id}
    ${"should return only not archived messages when 'archived' flag is 'true'"}      | ${aFiscalCodeWithMessages}    | ${[messagesList[0].id]} | ${false}         | ${5}     | ${undefined}                               | ${messagesList.slice(1, 6)}                       | ${messagesList[1]?.id}                      | ${messagesList[5]?.id}
  `(
    "$title, page size: $pageSize",
    async ({
      fiscalCode,
      messagesArchived,
      retrieveArchived,
      pageSize,
      maximum_id,
      expectedItems,
      expectedPrev,
      expectedNext
    }) => {
      await setMessagesAsArchived(cosmosdb, messagesArchived);
      await setMessagesViewAsArchived(cosmosdb, fiscalCode, messagesArchived);

      const response = await getMessagesWithEnrichment(fetch, baseUrl)(
        fiscalCode,
        pageSize,
        maximum_id,
        retrieveArchived
      );
      expect(response.status).toEqual(200);

      const body = (await response.json()) as PaginatedPublicMessagesCollection;

      // strip away undefind properties by stringify/parsing to JSON
      const expected = JSON.parse(
        JSON.stringify({
          items: expectedItems.map(mockEnrichMessage).map(m => ({
            ...m,
            has_attachments: false,
            has_precondition: false,
            has_remote_content: false,
            is_archived: (messagesArchived as NonEmptyString[]).includes(m.id),
            time_to_live: 3600
          })),
          prev: expectedPrev,
          next: expectedNext
        })
      );

      expect(body).toEqual(expected);
    }
  );

  it("should return a single message with third has_precondition = true for the user that has a single message with a third_party_data block inside it", async () => {
    const response = await getMessagesWithEnrichment(fetch, baseUrl)(
      aFiscalCodeWithMessagesWithThirdParty,
      5
    );
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].has_precondition).toBeTruthy();
  });
});

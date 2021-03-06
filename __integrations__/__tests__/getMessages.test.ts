/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable sort-keys */
import { exit } from "process";

import { CosmosClient, Database } from "@azure/cosmos";
import { createBlobService } from "azure-storage";

import * as TE from "fp-ts/TaskEither";
import { pipe } from "fp-ts/lib/function";

import { PaginatedPublicMessagesCollection } from "@pagopa/io-functions-commons/dist/generated/definitions/PaginatedPublicMessagesCollection";
import { retrievedMessageToPublic } from "@pagopa/io-functions-commons/dist/src/utils/messages";

import { RetrievedMessage } from "@pagopa/io-functions-commons/dist/src/models/message";
import {
  createCosmosDbAndCollections,
  fillMessages,
  fillMessagesStatus,
  fillMessagesView,
  fillServices,
  setMessagesAsArchived,
  setMessagesViewAsArchived
} from "../__mocks__/fixtures";

import {
  aFiscalCodeWithMessages,
  aFiscalCodeWithoutMessages,
  messagesList,
  messageStatusList,
  mockEnrichMessage
} from "../__mocks__/mock.messages";
import { serviceList } from "../__mocks__/mock.services";
import { createBlobs } from "../__mocks__/utils/azure_storage";
import { getNodeFetch } from "../utils/fetch";
import { getMessages, getMessagesWithEnrichment } from "../utils/client";
import { log } from "../utils/logger";

import {
  WAIT_MS,
  SHOW_LOGS,
  COSMOSDB_URI,
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

// eslint-disable-next-line functional/no-let
let database: Database;

// Wait some time
beforeAll(async () => {
  database = await pipe(
    createCosmosDbAndCollections(cosmosClient, COSMOSDB_NAME),
    TE.getOrElse(e => {
      throw Error("Cannot create db");
    })
  )();

  await pipe(
    createBlobs(blobService, [MESSAGE_CONTAINER_NAME]),
    TE.getOrElse(() => {
      throw Error("Cannot create azure storage");
    })
  )();

  await fillMessages(database, blobService, messagesList);
  await fillMessagesStatus(database, messageStatusList);
  await fillMessagesView(database, messagesList, messageStatusList);
  await fillServices(database, serviceList);

  await waitFunctionToSetup();
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
      fiscalCode                    | expectedItems   | expectedPrev           | expectedNext
      ${aFiscalCodeWithoutMessages} | ${[]}           | ${undefined}           | ${undefined}
      ${aFiscalCodeWithMessages}    | ${messagesList} | ${messagesList[0]?.id} | ${messagesList[9]?.id}
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
    title                                                                             | fiscalCode                    | messagesArchived        | retrieveArchived | pageSize | maximum_id            | expectedItems                | expectedPrev           | expectedNext
    ${"should return and empty list when user has no messages"}                       | ${aFiscalCodeWithoutMessages} | ${[]}                   | ${undefined}     | ${5}     | ${undefined}          | ${[]}                        | ${undefined}           | ${undefined}
    ${"should return first page "}                                                    | ${aFiscalCodeWithMessages}    | ${[]}                   | ${undefined}     | ${5}     | ${undefined}          | ${messagesList.slice(0, 5)}  | ${messagesList[0]?.id} | ${messagesList[4]?.id}
    ${"should return second page"}                                                    | ${aFiscalCodeWithMessages}    | ${[]}                   | ${undefined}     | ${5}     | ${messagesList[4].id} | ${messagesList.slice(5, 10)} | ${messagesList[5]?.id} | ${messagesList[9]?.id}
    ${"should return and empty list when user has no archived messages"}              | ${aFiscalCodeWithMessages}    | ${[]}                   | ${true}          | ${5}     | ${undefined}          | ${[]}                        | ${undefined}           | ${undefined}
    ${"should return only archived messages "}                                        | ${aFiscalCodeWithMessages}    | ${[messagesList[0].id]} | ${true}          | ${5}     | ${undefined}          | ${messagesList.slice(0, 1)}  | ${messagesList[0]?.id} | ${undefined}
    ${"should return only not archived messages when 'archived' flag is not present"} | ${aFiscalCodeWithMessages}    | ${[messagesList[0].id]} | ${undefined}     | ${5}     | ${undefined}          | ${messagesList.slice(1, 6)}  | ${messagesList[1]?.id} | ${messagesList[5]?.id}
    ${"should return only not archived messages when 'archived' flag is 'true'"}      | ${aFiscalCodeWithMessages}    | ${[messagesList[0].id]} | ${false}         | ${5}     | ${undefined}          | ${messagesList.slice(1, 6)}  | ${messagesList[1]?.id} | ${messagesList[5]?.id}
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
      await setMessagesAsArchived(database, messagesArchived);
      await setMessagesViewAsArchived(database, fiscalCode, messagesArchived);

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
});

// -----------------------
// utils
// -----------------------

const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const waitFunctionToSetup = async (): Promise<void> => {
  log("ENV: ", COSMOSDB_URI, WAIT_MS, SHOW_LOGS);
  // eslint-disable-next-line functional/no-let
  let i = 0;
  while (i < MAX_ATTEMPT) {
    log("Waiting the function to setup..");
    try {
      await fetch(baseUrl + "/api/info");
      break;
    } catch (e) {
      log("Waiting the function to setup..");
      await delay(WAIT_MS);
      i++;
    }
  }
  if (i >= MAX_ATTEMPT) {
    log("Function unable to setup in time");
    exit(1);
  }
};

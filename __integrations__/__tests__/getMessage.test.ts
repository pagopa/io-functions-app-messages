/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable sort-keys */

import { CosmosClient, Database } from "@azure/cosmos";
import { createBlobService } from "azure-storage";

import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/function";

import {
  createCosmosDbAndCollections,
  fillMessages,
  fillMessagesStatus,
  fillMessagesView,
  fillServices
} from "../__mocks__/fixtures";

import {
  aFiscalCodeWithMessages,
  messagesList,
  messageStatusList
} from "../__mocks__/mock.messages";
import { aService, serviceList } from "../__mocks__/mock.services";
import { createBlobs } from "../__mocks__/utils/azure_storage";
import { getNodeFetch } from "../utils/fetch";
import { getMessage } from "../utils/client";

import {
  WAIT_MS,
  COSMOSDB_URI,
  COSMOSDB_KEY,
  COSMOSDB_NAME,
  QueueStorageConnection,
  MESSAGE_CONTAINER_NAME
} from "../env";
import { InternalMessageResponseWithContent } from "@pagopa/io-functions-commons/dist/generated/definitions/InternalMessageResponseWithContent";

import { TagEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryBase";
import { aMessageStatus } from "../__mocks__/mock.messages";

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
  database = (
    await pipe(
      createCosmosDbAndCollections(
        {
          cosmosDbName: COSMOSDB_NAME,
          client: cosmosClient
        },
        O.none
      ),
      TE.getOrElse(_ => {
        throw Error("Cannot create db");
      })
    )()
  ).cosmosdb;

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
});

beforeEach(() => {
  jest.clearAllMocks();
});

// -------------------------
// Tests
// -------------------------

const aMessage = messagesList[0];
const aMessageWithThirdPartyDataWithConfigId = messagesList[messagesList.length - 1];

const expectedGetMessageResponseWithConfigId: InternalMessageResponseWithContent = {
  message: {
    content: aMessageWithThirdPartyDataWithConfigId.content,
    created_at: aMessageWithThirdPartyDataWithConfigId.createdAt,
    fiscal_code: aMessageWithThirdPartyDataWithConfigId.fiscalCode,
    id: aMessageWithThirdPartyDataWithConfigId.id,
    sender_service_id: aMessageWithThirdPartyDataWithConfigId.senderServiceId,
    time_to_live: aMessageWithThirdPartyDataWithConfigId.timeToLiveSeconds
  }
};

const expectedGetMessageResponse: InternalMessageResponseWithContent = {
  message: {
    content: aMessage.content,
    created_at: aMessage.createdAt,
    fiscal_code: aMessage.fiscalCode,
    id: aMessage.id,
    sender_service_id: aMessage.senderServiceId,
    time_to_live: aMessage.timeToLiveSeconds
  }
};

const expectedGetMessageResponseWithPublicAttributes: InternalMessageResponseWithContent = {
  message: {
    ...expectedGetMessageResponse.message,
    is_archived: aMessageStatus.isArchived,
    is_read: aMessageStatus.isRead,
    message_title: aMessage.content.subject,
    organization_name: aService.organizationName,
    service_name: aService.serviceName,
    category: {
      tag: TagEnum.GENERIC
    }
  }
};

describe("Get Message |> Success Results", () => {
  it.each`
    title                                                               | fiscalCode                 | msgId                                        | publicMessage | expectedResult
    ${"should return a message detail"}                                 | ${aFiscalCodeWithMessages} | ${aMessage.id}                               | ${undefined}  | ${expectedGetMessageResponse}
    ${"should return a message detail with public attributes"}          | ${aFiscalCodeWithMessages} | ${aMessage.id}                               | ${true}       | ${expectedGetMessageResponseWithPublicAttributes}
    ${"should return a message detail without using the config map"}    | ${aFiscalCodeWithMessages} | ${aMessageWithThirdPartyDataWithConfigId.id} | ${undefined}  | ${expectedGetMessageResponseWithConfigId}
  `("$title", async ({ fiscalCode, msgId, publicMessage, expectedResult }) => {
    console.log(
      `calling getMessage with fiscalCode=${fiscalCode},messageId=${msgId}`
    );
    const response = await getMessage(fetch, baseUrl)(
      fiscalCode,
      msgId,
      publicMessage
    );

    expect(response.status).toEqual(200);

    const body = (await response.json()) as InternalMessageResponseWithContent;

    // strip away undefind properties by stringify/parsing to JSON
    const expected = JSON.parse(JSON.stringify(expectedResult));

    expect(body).toEqual(expected);
  });
});

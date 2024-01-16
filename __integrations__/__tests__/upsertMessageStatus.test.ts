/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable sort-keys */

import { CosmosClient, Database } from "@azure/cosmos";
import { createBlobService } from "azure-storage";

import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";
import { pipe } from "fp-ts/lib/function";

import {
  createCosmosDbAndCollections,
  fillMessages,
  fillMessagesStatus,
  fillServices
} from "../__mocks__/fixtures";

import {
  aFiscalCodeWithMessages,
  aFiscalCodeWithoutMessages,
  aMessage,
  messagesList,
  messageStatusList
} from "../__mocks__/mock.messages";
import { serviceList } from "../__mocks__/mock.services";
import { createBlobs } from "../__mocks__/utils/azure_storage";
import { getNodeFetch } from "../utils/fetch";
import { upsertMessageStatus } from "../utils/client";

import {
  WAIT_MS,
  COSMOSDB_URI,
  COSMOSDB_KEY,
  COSMOSDB_NAME,
  QueueStorageConnection,
  MESSAGE_CONTAINER_NAME
} from "../env";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import {
  MessageStatus,
  MessageStatusModel
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { MessageStatusChange } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusChange";
import { randomInt } from "fp-ts/lib/Random";

// --------------------------
// Variables
// --------------------------

const aReadingStatusChange = {
  change_type: "reading",
  is_read: true
} as MessageStatusChange;

const anArchivingStatusChange = {
  change_type: "archiving",
  is_archived: true
} as MessageStatusChange;

const aBulkStatusChange = {
  change_type: "bulk",
  is_read: true,
  is_archived: true
} as MessageStatusChange;

// --------------------------

const MAX_ATTEMPT = 50;

jest.setTimeout(WAIT_MS * MAX_ATTEMPT);

const baseUrl = "http://function:7071/api/v1";
const fetch = getNodeFetch();

const getRandomInt = (max: number) => randomInt(0, max)().valueOf();

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
        { client: cosmosClient, cosmosDbName: COSMOSDB_NAME },
        O.none
      ),
      TE.getOrElse(() => {
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
  await fillServices(database, serviceList);
});

beforeEach(() => {
  jest.clearAllMocks();
});

// -------------------------
// Tests
// -------------------------

describe("Upsert Message Status |> Success Results |> Existing Message Status", () => {
  it("should return a new version of message-status when reading status is applied", async () => {
    // Always use a diffent messageId, since message-status collection is not refreshed
    const aMessageId = messagesList[0].id;

    const maybeCurrentStatus = await getMessageStatusList(aMessageId);
    if (O.isNone(maybeCurrentStatus)) {
      fail("Current Message Status not found");
    }
    const currentStatus = maybeCurrentStatus.value;

    const response = await upsertMessageStatus(fetch, baseUrl)(
      aFiscalCodeWithMessages,
      aMessageId,
      aReadingStatusChange
    );
    expect(response.status).toEqual(200);
    const body = (await response.json()) as MessageStatus;

    expect(body).toMatchObject(
      expect.objectContaining({
        version: currentStatus.version + 1,
        is_archived: currentStatus.isArchived,
        is_read: !currentStatus.isRead
      })
    );

    const maybeNewStatus = await getMessageStatusList(aMessageId);
    if (O.isNone(maybeNewStatus)) {
      fail("New Message Status not found");
    }
    const newStatus = maybeNewStatus.value;

    expect(newStatus).toMatchObject(
      expect.objectContaining({
        version: currentStatus.version + 1,
        isArchived: currentStatus.isArchived,
        isRead: !currentStatus.isRead
      })
    );
  });

  it("should return a new version of message-status when archiving status is applied", async () => {
    // Always use a diffent messageId, since message-status collection is not refreshed
    const aMessageId = messagesList[1].id;

    const maybeCurrentStatus = await getMessageStatusList(aMessageId);
    if (O.isNone(maybeCurrentStatus)) {
      fail("Current Message Status not found");
    }
    const currentStatus = maybeCurrentStatus.value;

    const response = await upsertMessageStatus(fetch, baseUrl)(
      aFiscalCodeWithMessages,
      aMessageId,
      anArchivingStatusChange
    );
    expect(response.status).toEqual(200);
    const body = (await response.json()) as MessageStatus;

    expect(body).toMatchObject(
      expect.objectContaining({
        version: currentStatus.version + 1,
        is_archived: !currentStatus.isArchived,
        is_read: currentStatus.isRead
      })
    );

    const maybeNewStatus = await getMessageStatusList(aMessageId);
    if (O.isNone(maybeNewStatus)) {
      fail("New Message Status not found");
    }
    const newStatus = maybeNewStatus.value;

    expect(newStatus).toMatchObject(
      expect.objectContaining({
        version: currentStatus.version + 1,
        isArchived: !currentStatus.isArchived,
        isRead: currentStatus.isRead
      })
    );
  });

  it("should return a new version of message-status when bulk status is applied", async () => {
    // Always use a diffent messageId, since message-status collection is not refreshed
    const aMessageId = messagesList[2].id;

    const maybeCurrentStatus = await getMessageStatusList(aMessageId);
    if (O.isNone(maybeCurrentStatus)) {
      fail("Current Message Status not found");
    }
    const currentStatus = maybeCurrentStatus.value;

    const response = await upsertMessageStatus(fetch, baseUrl)(
      aFiscalCodeWithMessages,
      aMessageId,
      aBulkStatusChange
    );
    expect(response.status).toEqual(200);
    const body = (await response.json()) as MessageStatus;

    expect(body).toMatchObject(
      expect.objectContaining({
        version: currentStatus.version + 1,
        is_archived: !currentStatus.isArchived,
        is_read: !currentStatus.isRead
      })
    );

    const maybeNewStatus = await getMessageStatusList(aMessageId);
    if (O.isNone(maybeNewStatus)) {
      fail("New Message Status not found");
    }
    const newStatus = maybeNewStatus.value;

    expect(newStatus).toMatchObject(
      expect.objectContaining({
        version: currentStatus.version + 1,
        isArchived: !currentStatus.isArchived,
        isRead: !currentStatus.isRead
      })
    );
  });
});

describe("Upsert Message Status |> Errors", () => {
  it("should return 404 when no messageStatus was found", async () => {
    // Add new message without any message status
    const randomId = getRandomInt(1000000);
    const aMessageWithoutMessageStatus = {
      ...aMessage,
      id: `${aMessage.id}_nostatus_${randomId}` as NonEmptyString,
      indexedId: `${aMessage.id}_nostatus_${randomId}` as NonEmptyString
    };
    await fillMessages(database, blobService, [aMessageWithoutMessageStatus]);

    const aMessageId = aMessageWithoutMessageStatus.id;

    const maybeCurrentStatus = await getMessageStatusList(aMessageId);
    if (O.isSome(maybeCurrentStatus)) {
      fail("Message Status found, but not expected");
    }

    const response = await upsertMessageStatus(fetch, baseUrl)(
      aFiscalCodeWithMessages,
      aMessageId,
      aReadingStatusChange
    );
    expect(response.status).toEqual(404);
  });

  it("should return 403 when fiscalCode does not match with messageStatus one", async () => {
    const aMessageId = messagesList[4].id;

    const response = await upsertMessageStatus(fetch, baseUrl)(
      aFiscalCodeWithoutMessages,
      aMessageId,
      aReadingStatusChange
    );
    expect(response.status).toEqual(403);
  });
});

const getMessageStatusList = async (messageId: NonEmptyString) => {
  const model = new MessageStatusModel(database.container("message-status"));

  return pipe(
    model.findLastVersionByModelId([messageId]),
    TE.getOrElse(() => {
      fail("Current MessageStatus not found");
    }),
    x => x
  )();
};

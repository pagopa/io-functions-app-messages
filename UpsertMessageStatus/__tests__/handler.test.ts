// eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-duplicate-string, sonar/sonar-max-lines-per-function

import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";

import { context as contextMock } from "../../__mocks__/durable-functions";
import { aFiscalCode } from "../../__mocks__/mocks";
import { UpsertMessageStatusHandler } from "../handler";
import {
  MessageStatusModel,
  RetrievedMessageStatus
} from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { MessageStatusChange } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusChange";

import {
  aRetrievedMessageStatus,
  aMessageId
} from "../../__mocks__/mocks.message-status";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";

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
// Mocks
// --------------------------

const mockFindLastVersionByModelId = jest.fn(key =>
  TE.of<CosmosErrors, O.Option<RetrievedMessageStatus>>(
    O.some(aRetrievedMessageStatus)
  )
);
const mockUpsert = jest.fn(status =>
  TE.of<CosmosErrors, O.Option<RetrievedMessageStatus>>({
    ...aRetrievedMessageStatus,
    ...status,
    kind: "IRetrievedMessageStatus",
    version: aRetrievedMessageStatus.version + 1
  })
);

const mockMessageStatusModel = ({
  findLastVersionByModelId: mockFindLastVersionByModelId,
  upsert: mockUpsert
} as any) as MessageStatusModel;

describe("GetMessageHandler", () => {
  afterEach(() => jest.clearAllMocks());

  it("should respond with a new version of message-status when change_type is `reading`", async () => {
    const upsertMessageStatusHandler = UpsertMessageStatusHandler(
      mockMessageStatusModel
    );

    const result = await upsertMessageStatusHandler(
      contextMock as any,
      aFiscalCode,
      aMessageId,
      aReadingStatusChange
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        isRead: true,
        isArchived: false,
        fiscalCode: aFiscalCode
      })
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toMatchObject({
        version: aRetrievedMessageStatus.version + 1
      });
    }
  });

  it("should respond with a new version of message-status when change_type is `archiving`", async () => {
    const upsertMessageStatusHandler = UpsertMessageStatusHandler(
      mockMessageStatusModel
    );

    const result = await upsertMessageStatusHandler(
      contextMock as any,
      aFiscalCode,
      aMessageId,
      anArchivingStatusChange
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        isRead: false,
        isArchived: true,
        fiscalCode: aFiscalCode
      })
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toMatchObject({
        version: aRetrievedMessageStatus.version + 1
      });
    }
  });

  it("should respond with a new version of message-status when change_type is `bulk`", async () => {
    const upsertMessageStatusHandler = UpsertMessageStatusHandler(
      mockMessageStatusModel
    );

    const result = await upsertMessageStatusHandler(
      contextMock as any,
      aFiscalCode,
      aMessageId,
      aBulkStatusChange
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        isRead: true,
        isArchived: true,
        fiscalCode: aFiscalCode
      })
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toMatchObject({
        version: aRetrievedMessageStatus.version + 1
      });
    }
  });

  it("should respond with a new version of message-status when no mesage-status was found", async () => {
    mockFindLastVersionByModelId
      .mockImplementationOnce(() => TE.of(O.none))
      .mockImplementationOnce(() => TE.of(O.none));

    mockUpsert.mockImplementationOnce(status =>
      TE.of<CosmosErrors, O.Option<RetrievedMessageStatus>>({
        ...status,
        kind: "IRetrievedMessageStatus",
        version: 0
      })
    );

    const upsertMessageStatusHandler = UpsertMessageStatusHandler(
      mockMessageStatusModel
    );

    const result = await upsertMessageStatusHandler(
      contextMock as any,
      aFiscalCode,
      aMessageId,
      aReadingStatusChange
    );

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        isRead: true,
        isArchived: false,
        fiscalCode: aFiscalCode
      })
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toMatchObject({
        version: 0
      });
    }
  });
});

describe("GetMessageHandler - Errors", () => {
  afterEach(() => jest.clearAllMocks());
});

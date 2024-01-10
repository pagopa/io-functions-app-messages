// eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-duplicate-string, sonar/sonar-max-lines-per-function
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as t from "io-ts";

import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import {
  MessageModel,
  NewMessageWithoutContent,
  RetrievedMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import { retrievedMessageToPublic } from "@pagopa/io-functions-commons/dist/src/utils/messages";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  aCosmosResourceMetadata,
  aPnThirdPartyData
} from "../../__mocks__/mocks";
import {
  aRetrievedService,
  aServiceId
} from "../../__mocks__/mocks.service_preference";
import { GetMessagesHandler } from "../handler";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { BlobService } from "azure-storage";
import {
  RetrievedService,
  ServiceModel
} from "@pagopa/io-functions-commons/dist/src/models/service";
import {
  CosmosErrors,
  toCosmosErrorResponse
} from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { Context } from "@azure/functions";
import { TagEnum as TagEnumPayment } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPayment";
import { TagEnum as TagEnumPN } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPN";
import { TagEnum as TagEnumBase } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryBase";
import { RetrievedMessageStatus } from "@pagopa/io-functions-commons/dist/src/models/message_status";
import { NotRejectedMessageStatusValueEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/NotRejectedMessageStatusValue";
import { MessageStatusExtendedQueryModel } from "../../model/message_status_query";
import { pipe } from "fp-ts/lib/function";
import * as redis from "../../utils/redis_storage";
import { createGetMessagesFunctionSelection } from "../getMessagesFunctions/getMessages.selector";
import { MessageViewExtendedQueryModel } from "../../model/message_view_query";
import { RetrievedMessageView } from "@pagopa/io-functions-commons/dist/src/models/message_view";
import { toEnrichedMessageWithContent } from "../getMessagesFunctions/getMessages.view";
import { FeatureLevelTypeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/FeatureLevelType";
import { PaymentData } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentData";
import { PaymentAmount } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentAmount";
import { PaymentNoticeNumber } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentNoticeNumber";
import { PaymentDataWithRequiredPayee } from "@pagopa/io-functions-commons/dist/generated/definitions/PaymentDataWithRequiredPayee";
import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";
import { IConfig } from "../../utils/config";
import {
  aRetrievedRemoteContentConfiguration,
  mockFind,
  mockRemoteContentConfigurationModel,
  mockRemoteContentConfigurationTtl
} from "../../__mocks__/remote-content";
import { Has_preconditionEnum } from "../../generated/definitions/ThirdPartyData";

const aFiscalCode = "FRLFRC74E04B157I" as FiscalCode;
const aMessageId = "A_MESSAGE_ID" as NonEmptyString;
const aPendingMessageId = "A_PENDING_MESSAGE_ID" as NonEmptyString;

const aRetrievedMessageStatus: RetrievedMessageStatus = {
  ...aCosmosResourceMetadata,
  id: "1" as NonEmptyString,
  messageId: "1" as NonEmptyString,
  status: NotRejectedMessageStatusValueEnum.PROCESSED,
  updatedAt: new Date(),
  version: 2 as NonNegativeInteger,
  isRead: false,
  isArchived: false,
  kind: "IRetrievedMessageStatus"
};

const aNewMessageWithoutContent: NewMessageWithoutContent = {
  createdAt: new Date(),
  featureLevelType: FeatureLevelTypeEnum.STANDARD,
  fiscalCode: aFiscalCode,
  id: aMessageId,
  indexedId: "A_MESSAGE_ID" as NonEmptyString,
  isPending: false,
  kind: "INewMessageWithoutContent",
  senderServiceId: aServiceId,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

const aPaymentDataWithoutPayee: PaymentData = {
  amount: 1000 as PaymentAmount,
  notice_number: "177777777777777777" as PaymentNoticeNumber
};

const aPaymentDataWithPayee: PaymentDataWithRequiredPayee = {
  ...aPaymentDataWithoutPayee,
  payee: { fiscal_code: "12345699999" as OrganizationFiscalCode }
};

const aRetrievedMessageWithoutContent: RetrievedMessageWithoutContent = {
  ...aNewMessageWithoutContent,
  ...aCosmosResourceMetadata,
  kind: "IRetrievedMessageWithoutContent"
};

const aRetrievedPendingMessageWithoutContent: RetrievedMessageWithoutContent = {
  ...aNewMessageWithoutContent,
  ...aCosmosResourceMetadata,
  id: aPendingMessageId,
  isPending: true,
  kind: "IRetrievedMessageWithoutContent"
};

const aRetrievedMessageView: RetrievedMessageView = pipe(
  RetrievedMessageView.decode({
    ...aCosmosResourceMetadata,
    components: {
      attachments: {
        has: false
      },
      euCovidCert: {
        has: false
      },
      legalData: {
        has: false
      },
      payment: {
        has: true,
        notice_number: "177777777777777777"
      }
    },
    createdAt: "2021-05-09T14:55:52.206Z",
    fiscalCode: aFiscalCode,
    id: "aMessageId",
    messageTitle: "reprehenderit unde rerum ea officiis",
    senderServiceId: aRetrievedService.serviceId,
    status: {
      archived: false,
      processing: "PROCESSED",
      read: false
    },
    version: 0,
    timeToLive: 3600
  }),
  E.getOrElseW(() => {
    throw Error("wrong RetrievedMessageView");
  })
);

//----------------------------
// Mocks
//----------------------------

const blobServiceMock = ({
  getBlobToText: jest.fn().mockReturnValue(
    TE.of(
      O.some({
        subject: "a subject",
        markdown: "a markdown"
      } as MessageContent)
    )
  )
} as unknown) as BlobService;

const getMockIterator = values => ({
  next: jest
    .fn()
    .mockImplementationOnce(async () => ({
      value: values
    }))
    .mockImplementationOnce(async () => ({ done: true }))
});

const getContentFromBlobMock = jest.fn().mockImplementation(() =>
  TE.of(
    O.some({
      subject: "a subject",
      markdown: "a markdown"
    } as MessageContent)
  )
);

const getMessageModelMock = messageIterator =>
  (({
    getContentFromBlob: getContentFromBlobMock,
    findMessages: jest.fn(() => TE.of(messageIterator))
  } as unknown) as MessageModel);

const errorMessageModelMock = ({
  getContentFromBlob: jest.fn(() => TE.left("Error blob")),
  findMessages: jest.fn(() => {
    return TE.left(toCosmosErrorResponse("Not found"));
  })
} as unknown) as MessageModel;

const mockFindLastVersionByModelId = jest.fn(() =>
  TE.of<CosmosErrors, O.Option<RetrievedService>>(O.some(aRetrievedService))
);
const serviceModelMock = ({
  findLastVersionByModelId: mockFindLastVersionByModelId
} as unknown) as ServiceModel;

const functionsContextMock = ({
  log: {
    error: jest.fn(console.log)
  }
} as unknown) as Context;

/**
 * Build a service list iterator
 */
async function* buildIterator<A, I extends unknown, O extends unknown>(
  codec: t.Type<A, I, O>,
  list: ReadonlyArray<O>,
  onNewPage?: (i: number) => void,
  errorToThrow?: CosmosErrors | Error
): AsyncIterable<ReadonlyArray<t.Validation<A>>> {
  // eslint-disable-next-line functional/no-let

  if (errorToThrow) {
    throw errorToThrow;
  }

  let i = 0;
  for (const p of pipe(list, RA.map(codec.decode), RA.chunksOf(2))) {
    yield p;
    if (onNewPage) onNewPage(i);
    i++;
  }
}

// MessageStatus Mocks
const mockFindAllVersionsByModelIdIn = jest.fn((ids: string[]) => {
  return buildIterator(
    RetrievedMessageStatus,
    ids.map(id => ({ ...aRetrievedMessageStatus, messageId: id }))
  );
});

const messageStatusModelMock = ({
  findAllVersionsByModelIdIn: mockFindAllVersionsByModelIdIn
} as unknown) as MessageStatusExtendedQueryModel;

// MessageView Mocks
const mockQueryPage = jest.fn(_ => {
  return TE.of<
    CosmosErrors,
    AsyncIterable<ReadonlyArray<t.Validation<RetrievedMessageView>>>
  >(
    buildIterator(
      RetrievedMessageView,
      Array.from({ length: 1 }, _ => aRetrievedMessageView)
    )
  );
});
const messageViewModelMock = ({
  queryPage: mockQueryPage
} as unknown) as MessageViewExtendedQueryModel;

const setWithExpirationTaskMock = jest.fn(() => TE.of<Error, true>(true));
jest
  .spyOn(redis, "setWithExpirationTask")
  .mockImplementation(setWithExpirationTaskMock);

const getTaskMock = jest.fn(
  (): TE.TaskEither<Error, O.Option<string>> =>
    TE.of(O.some(JSON.stringify(aRetrievedService)))
);
jest.spyOn(redis, "getTask").mockImplementation(getTaskMock);

const redisClientMock = {} as any;

const dummyThirdPartyDataWithCategoryFetcher = jest
  .fn()
  .mockImplementation(() => ({
    category: TagEnumBase.GENERIC
  }));

const mockConfig = { SERVICE_CACHE_TTL_DURATION: 3600 } as IConfig;

// utility function to avoid code duplication in this file
const getCreateGetMessagesFunctionSelection = (
  messageStatusModel: MessageStatusExtendedQueryModel,
  messageModelMock: MessageModel,
  dummyThirdPartyDataWithCategoryFetcher?: (
    serviceId: NonEmptyString
  ) => { category: TagEnumPN | TagEnumBase }
) =>
  createGetMessagesFunctionSelection(
    false,
    "none",
    [],
    "XYZ" as NonEmptyString,
    [
      messageModelMock,
      messageStatusModel,
      blobServiceMock,
      mockRemoteContentConfigurationModel,
      redisClientMock,
      mockRemoteContentConfigurationTtl,
      dummyThirdPartyDataWithCategoryFetcher!
    ],
    [
      messageViewModelMock,
      mockRemoteContentConfigurationModel,
      redisClientMock,
      mockRemoteContentConfigurationTtl,
      dummyThirdPartyDataWithCategoryFetcher!
    ]
  );

// ---------------------
// Tests
// ---------------------

describe("GetMessagesHandler |> Fallback |> No Enrichment", () => {
  const aSimpleList = [
    aRetrievedMessageWithoutContent,
    aRetrievedMessageWithoutContent,
    aRetrievedMessageWithoutContent,
    aRetrievedMessageWithoutContent,
    aRetrievedMessageWithoutContent,
    aRetrievedPendingMessageWithoutContent
  ];
  const aMessageList = aSimpleList.map(m => E.right(m));

  beforeEach(() => jest.clearAllMocks());

  it("should respond with a query error if it cannot retrieve messages", async () => {
    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      errorMessageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.none,
      O.none,
      O.none,
      O.none,
      O.none
    );
    expect(result.kind).toBe("IResponseErrorQuery");
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with the messages for the recipient when no parameters are given", async () => {
    const messages = [E.right(aRetrievedMessageWithoutContent)];
    const messageIterator = getMockIterator(messages);
    const messageModelMock = getMessageModelMock(messageIterator);

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.none,
      O.none,
      O.none,
      O.none,
      O.none
    );
    expect(result.kind).toBe("IResponseSuccessJson");
    expect(messageIterator.next).toHaveBeenCalledTimes(2);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond only with non-pending messages", async () => {
    const messages = [
      E.right(aRetrievedMessageWithoutContent),
      E.right(aRetrievedPendingMessageWithoutContent)
    ];
    const messageIterator = getMockIterator(messages);
    const messageModelMock = getMessageModelMock(messageIterator);

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.none,
      O.none,
      O.none,
      O.none,
      O.none
    );
    expect(result.kind).toBe("IResponseSuccessJson");

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [retrievedMessageToPublic(aRetrievedMessageWithoutContent)],
        prev: aRetrievedMessageWithoutContent.id,
        next: undefined
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(2);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with a page of given page size", async () => {
    const messageIterator = getMockIterator(aMessageList);
    const messageModelMock = getMessageModelMock(messageIterator);

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.none,
      O.none,
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [
          aRetrievedMessageWithoutContent,
          aRetrievedMessageWithoutContent
        ].map(retrievedMessageToPublic),
        prev: aSimpleList[0].id,
        next: aSimpleList[2].id
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with a page of messages when given maximum id", async () => {
    const messageIterator = getMockIterator(aMessageList);
    const messageModelMock = getMessageModelMock(messageIterator);

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.none,
      O.none,
      O.some(aRetrievedMessageWithoutContent.id),
      O.none
    );
    expect(result.kind).toBe("IResponseSuccessJson");

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [
          aRetrievedMessageWithoutContent,
          aRetrievedMessageWithoutContent
        ].map(retrievedMessageToPublic),
        prev: aRetrievedMessageWithoutContent.id,
        next: aRetrievedMessageWithoutContent.id
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with a page of messages above given minimum id", async () => {
    const messageIterator = getMockIterator(aMessageList);
    const messageModelMock = getMessageModelMock(messageIterator);

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.none,
      O.none,
      O.none,
      O.some(aRetrievedMessageWithoutContent.id)
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [
          aRetrievedMessageWithoutContent,
          aRetrievedMessageWithoutContent
        ].map(retrievedMessageToPublic),
        prev: aRetrievedMessageWithoutContent.id,
        next: aRetrievedMessageWithoutContent.id
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with undefined next when last element of the page is the last of all", async () => {
    const messages = [
      E.right(aRetrievedMessageWithoutContent),
      E.right(aRetrievedMessageWithoutContent)
    ];
    const messageIterator = getMockIterator(messages);
    const messageModelMock = getMessageModelMock(messageIterator);

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.none,
      O.none,
      O.none,
      O.some(aRetrievedMessageWithoutContent.id)
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [
          aRetrievedMessageWithoutContent,
          aRetrievedMessageWithoutContent
        ].map(retrievedMessageToPublic),
        prev: aRetrievedMessageWithoutContent.id,
        next: undefined
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(2);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });
});

describe("GetMessagesHandler |> Fallback |> Enrichment", () => {
  const aSimpleList = [
    {
      ...aRetrievedMessageWithoutContent,
      id: "aMessageId_5" as NonEmptyString
    },
    {
      ...aRetrievedMessageWithoutContent,
      id: "aMessageId_4" as NonEmptyString
    },
    {
      ...aRetrievedMessageWithoutContent,
      id: "aMessageId_3" as NonEmptyString
    },
    {
      ...aRetrievedMessageWithoutContent,
      id: "aMessageId_2" as NonEmptyString
    },
    {
      ...aRetrievedMessageWithoutContent,
      id: "aMessageId_1" as NonEmptyString
    },
    {
      ...aRetrievedPendingMessageWithoutContent,
      id: "aMessageId_P" as NonEmptyString
    }
  ];
  const aMessageList = aSimpleList.map(m => E.right(m));

  beforeEach(() => jest.clearAllMocks());

  it("should respond with a page of messages when given enrichment parameter", async () => {
    const messageIterator = getMockIterator(aMessageList);
    const messageModelMock = getMessageModelMock(messageIterator);

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.none,
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    const expectedEnrichedMessage = {
      ...retrievedMessageToPublic(aSimpleList[0]),
      category: { tag: TagEnumBase.GENERIC },
      has_attachments: false,
      message_title: "a subject",
      is_archived: false,
      is_read: false,
      has_precondition: false,
      has_remote_content: false,
      organization_name: aRetrievedService.organizationName,
      service_name: aRetrievedService.serviceName
    };

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [
          { ...expectedEnrichedMessage, id: aSimpleList[0].id },
          { ...expectedEnrichedMessage, id: aSimpleList[1].id }
        ],
        prev: aSimpleList[0].id,
        next: aSimpleList[1].id
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(1);
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    // if the getTask correctly retrieve the service, the RC model is not called
    expect(mockFind).not.toHaveBeenCalled();
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should not call the RC model if the redis cache works", async () => {
    const messageIterator = getMockIterator(aMessageList);
    const messageModelMock = getMessageModelMock(messageIterator);

    getTaskMock.mockReturnValueOnce(TE.left(new Error("Error")));

    // we expect for 2 messages to have remote_content and preconditions
    getContentFromBlobMock.mockReturnValueOnce(
      TE.of(
        O.some({
          subject: "a subject",
          markdown: "a markdown",
          third_party_data: {
            has_remote_content: true,
            has_precondition: Has_preconditionEnum.ALWAYS
          }
        })
      )
    );

    getContentFromBlobMock.mockReturnValueOnce(
      TE.of(
        O.some({
          subject: "a subject",
          markdown: "a markdown",
          third_party_data: {
            has_remote_content: true,
            has_precondition: Has_preconditionEnum.ALWAYS
          }
        })
      )
    );

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.none,
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    const expectedEnrichedMessage = {
      ...retrievedMessageToPublic(aSimpleList[0]),
      category: { tag: TagEnumBase.GENERIC },
      has_attachments: false,
      message_title: "a subject",
      is_archived: false,
      is_read: false,
      has_precondition: true,
      has_remote_content: true,
      organization_name: aRetrievedService.organizationName,
      service_name: aRetrievedService.serviceName
    };

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [
          { ...expectedEnrichedMessage, id: aSimpleList[0].id },
          { ...expectedEnrichedMessage, id: aSimpleList[1].id }
        ],
        prev: aSimpleList[0].id,
        next: aSimpleList[1].id
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(1);
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    // if the getTask correctly retrieve the service, the RC model is not called
    expect(mockFind).not.toHaveBeenCalled();
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with a payment message with rptId using payee fiscal code, when payee is defined", async () => {
    const messageIterator = getMockIterator(aMessageList);
    const messageModelMock = getMessageModelMock(messageIterator);

    messageModelMock.getContentFromBlob = jest.fn().mockImplementation(() =>
      TE.of(
        O.some({
          subject: "a subject",
          markdown: "a markdown",
          payment_data: aPaymentDataWithPayee
        } as MessageContent)
      )
    );

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.none,
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    const expectedEnrichedMessage = {
      ...retrievedMessageToPublic(aSimpleList[0]),
      category: {
        tag: TagEnumPayment.PAYMENT,
        rptId: `${aPaymentDataWithPayee.payee.fiscal_code}${aPaymentDataWithPayee.notice_number}`
      },
      has_attachments: false,
      has_precondition: false,
      has_remote_content: false,
      message_title: "a subject",
      is_archived: false,
      is_read: false,
      organization_name: aRetrievedService.organizationName,
      service_name: aRetrievedService.serviceName
    };

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [
          { ...expectedEnrichedMessage, id: aSimpleList[0].id },
          { ...expectedEnrichedMessage, id: aSimpleList[1].id }
        ],
        prev: aSimpleList[0].id,
        next: aSimpleList[1].id
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(1);
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    // if the getTask correctly retrieve the service, the RC model is not called
    expect(mockFind).not.toHaveBeenCalled();
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with a pn message when third_party_data is defined", async () => {
    const thirdPartyFetcherForAServiceId = (serviceId: NonEmptyString) => ({
      category: serviceId == aServiceId ? TagEnumPN.PN : TagEnumBase.GENERIC
    });

    getTaskMock.mockReturnValueOnce(
      TE.of(O.some(JSON.stringify(aRetrievedRemoteContentConfiguration)))
    );

    const messageIterator = getMockIterator([aMessageList[0]]);
    const messageModelMock = getMessageModelMock(messageIterator);

    getContentFromBlobMock.mockReturnValueOnce(
      TE.of(
        O.some({
          subject: "a subject",
          markdown: "a markdown",
          third_party_data: aPnThirdPartyData
        } as MessageContent)
      )
    );

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock,
      thirdPartyFetcherForAServiceId
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.none,
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    const expectedEnrichedMessage = {
      ...retrievedMessageToPublic(aSimpleList[0]),
      category: {
        tag: TagEnumPN.PN,
        ...aPnThirdPartyData
      },
      has_precondition: true,
      has_attachments: false,
      has_remote_content: false,
      message_title: "a subject",
      is_archived: false,
      is_read: false,
      organization_name: aRetrievedService.organizationName,
      service_name: aRetrievedService.serviceName
    };

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [{ ...expectedEnrichedMessage, id: aSimpleList[0].id }],
        prev: aSimpleList[0].id
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(2);
    expect(getTaskMock).toHaveBeenCalledTimes(2);
    // if the getTask correctly retrieve the service, the RC model is not called
    expect(mockFind).not.toHaveBeenCalled();
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with a payment message with rptId using service fiscal code, if payee is not defined", async () => {
    const messageIterator = getMockIterator(aMessageList);
    const messageModelMock = getMessageModelMock(messageIterator);

    messageModelMock.getContentFromBlob = jest.fn().mockImplementation(() =>
      TE.of(
        O.some({
          subject: "a subject",
          markdown: "a markdown",
          payment_data: aPaymentDataWithoutPayee
        } as MessageContent)
      )
    );

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.none,
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    const expectedEnrichedMessage = {
      ...retrievedMessageToPublic(aSimpleList[0]),
      category: {
        tag: TagEnumPayment.PAYMENT,
        rptId: `${aRetrievedService.organizationFiscalCode}${aPaymentDataWithoutPayee.notice_number}`
      },
      has_attachments: false,
      has_remote_content: false,
      has_precondition: false,
      message_title: "a subject",
      is_archived: false,
      is_read: false,
      organization_name: aRetrievedService.organizationName,
      service_name: aRetrievedService.serviceName
    };

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [
          { ...expectedEnrichedMessage, id: aSimpleList[0].id },
          { ...expectedEnrichedMessage, id: aSimpleList[1].id }
        ],
        prev: aSimpleList[0].id,
        next: aSimpleList[1].id
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(1);
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    // if the getTask correctly retrieve the service, the RC model is not called
    expect(mockFind).not.toHaveBeenCalled();
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with no messages when archived is requested", async () => {
    const messageIterator = getMockIterator(aMessageList);
    const messageModelMock = getMessageModelMock(messageIterator);

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.some(true),
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [],
        prev: undefined,
        next: undefined
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(2);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with archived messages only when archived filter is true", async () => {
    const messageIterator = getMockIterator(aMessageList);
    const messageModelMock = getMessageModelMock(messageIterator);

    mockFindAllVersionsByModelIdIn.mockImplementationOnce((ids: string[]) => {
      return buildIterator(
        RetrievedMessageStatus,
        ids.map((id, index) => ({
          ...aRetrievedMessageStatus,
          messageId: id,
          isArchived: index === 0
        }))
      );
    });

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.some(true),
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    const expectedEnrichedMessage = {
      ...retrievedMessageToPublic(aSimpleList[0]),
      category: { tag: TagEnumBase.GENERIC },
      has_attachments: false,
      has_remote_content: false,
      has_precondition: false,
      message_title: "a subject",
      is_archived: true,
      is_read: false,
      organization_name: aRetrievedService.organizationName,
      service_name: aRetrievedService.serviceName
    };

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [expectedEnrichedMessage],
        prev: aSimpleList[0].id,
        next: undefined
      });
    }

    expect(messageIterator.next).toHaveBeenCalledTimes(2);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with internal error when messages cannot be enriched with content", async () => {
    const getContentFromBlob = jest
      .fn()
      .mockReturnValue(
        TE.of(
          O.some({
            subject: "a subject",
            markdown: "a markdown"
          } as MessageContent)
        )
      )
      .mockReturnValueOnce(TE.left(new Error("GENERIC_ERROR")));
    const messagesIter = {
      next: jest
        .fn()
        .mockImplementationOnce(async () => ({
          value: aMessageList
        }))
        .mockImplementationOnce(async () => ({ done: true }))
    };
    const messageModelMock = {
      getContentFromBlob,
      findMessages: jest.fn().mockReturnValue(TE.of(messagesIter))
    };
    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock as any
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.none,
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseErrorInternal");
    expect(messagesIter.next).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).toHaveBeenCalledWith(
      `Cannot enrich message "${aSimpleList[0].id}" | Error: GENERIC_ERROR`
    );
  });

  it("should respond with internal error when messages cannot be enriched with message status info", async () => {
    const messageIterator = getMockIterator(aMessageList);
    const messageModelMock = getMessageModelMock(messageIterator);

    mockFindAllVersionsByModelIdIn.mockImplementationOnce((ids: string[]) => {
      return buildIterator(
        RetrievedMessageStatus,
        ids.map((id, index) => ({
          ...aRetrievedMessageStatus,
          messageId: id,
          isArchived: index === 0
        })),
        undefined,
        toCosmosErrorResponse("Any message-status error")
      );
    });

    const getMessagesFunctionSelector = getCreateGetMessagesFunctionSelection(
      messageStatusModelMock,
      messageModelMock
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.none,
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseErrorInternal");
    expect(messageIterator.next).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).toHaveBeenCalledWith(
      `Cannot enrich message status | Error: Error retrieving data from cosmos.`
    );
  });
});

describe("GetMessagesHandler |> Message View", () => {
  const aSimpleList = [
    {
      ...aRetrievedMessageView,
      id: "aMessageId_5" as NonEmptyString
    },
    {
      ...aRetrievedMessageView,
      id: "aMessageId_4" as NonEmptyString
    },
    {
      ...aRetrievedMessageView,
      id: "aMessageId_3" as NonEmptyString
    },
    {
      ...aRetrievedMessageView,
      id: "aMessageId_2" as NonEmptyString
    },
    {
      ...aRetrievedMessageView,
      id: "aMessageId_1" as NonEmptyString
    }
  ];

  const getMessagesFunctionSelector = createGetMessagesFunctionSelection(
    false,
    "prod",
    [],
    "XYZ" as NonEmptyString,
    [
      {} as MessageModel,
      {} as MessageStatusExtendedQueryModel,
      {} as BlobService,
      mockRemoteContentConfigurationModel,
      redisClientMock,
      mockRemoteContentConfigurationTtl,
      dummyThirdPartyDataWithCategoryFetcher
    ],
    [
      messageViewModelMock,

      mockRemoteContentConfigurationModel,
      redisClientMock,
      mockRemoteContentConfigurationTtl,
      dummyThirdPartyDataWithCategoryFetcher
    ]
  );

  beforeEach(() => jest.clearAllMocks());

  it("should respond with a page of messages", async () => {
    let iteratorCalls = 0;

    mockQueryPage.mockImplementationOnce(_ => {
      return TE.of(
        buildIterator(RetrievedMessageView, aSimpleList, _ => {
          iteratorCalls++;
        })
      );
    });

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.none,
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    const expectedEnrichedMessage = {
      ...toEnrichedMessageWithContent(dummyThirdPartyDataWithCategoryFetcher)(
        aSimpleList[0],
        false
      ),
      category: {
        rptId: `${aRetrievedService.organizationFiscalCode}177777777777777777`,
        tag: "PAYMENT"
      },
      organization_name: aRetrievedService.organizationName,
      has_remote_content: false,
      has_precondition: false,
      service_name: aRetrievedService.serviceName
    };

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [
          { ...expectedEnrichedMessage, id: aSimpleList[0].id },
          { ...expectedEnrichedMessage, id: aSimpleList[1].id }
        ],
        prev: aSimpleList[0].id,
        next: aSimpleList[1].id
      });
    }

    expect(iteratorCalls).toEqual(1);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with a page with a PN message if the sender service id match PN one", async () => {
    const aPnMessageList: ReadonlyArray<RetrievedMessageView> = pipe(
      RA.makeBy(5, i => ({
        ...aRetrievedMessageView,
        id: `aMessageId_${i + 1}` as NonEmptyString,
        senderServiceId: aServiceId,
        components: {
          ...aRetrievedMessageView.components,
          thirdParty: { has: true, ...aPnThirdPartyData }
        }
      })),
      RA.map(RetrievedMessageView.decode),
      RA.rights
    );
    expect(aPnMessageList.length).toBe(5);

    getTaskMock.mockReturnValueOnce(
      TE.of(O.some(JSON.stringify(aRetrievedRemoteContentConfiguration)))
    );

    let iteratorCalls = 0;
    dummyThirdPartyDataWithCategoryFetcher.mockImplementationOnce(
      serviceId => ({
        category: serviceId == aServiceId ? TagEnumPN.PN : TagEnumBase.GENERIC
      })
    );
    mockQueryPage.mockImplementationOnce(_ => {
      return TE.of(
        buildIterator(RetrievedMessageView, aPnMessageList, _ => {
          iteratorCalls++;
        })
      );
    });

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 1 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.none,
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              has_precondition: true,
              category: {
                ...aPnThirdPartyData,
                tag: TagEnumPN.PN
              }
            })
          ])
        })
      );
    }

    expect(dummyThirdPartyDataWithCategoryFetcher).toBeCalledWith(aServiceId);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with no messages when archived is requested", async () => {
    let iteratorCalls = 0;

    mockQueryPage.mockImplementationOnce(_ => {
      return TE.of(
        buildIterator(RetrievedMessageView, [], _ => {
          iteratorCalls++;
        })
      );
    });

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.some(true),
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [],
        prev: undefined,
        next: undefined
      });
    }

    expect(iteratorCalls).toEqual(0);
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with archived messages only when archived is requested", async () => {
    let iteratorCalls = 0;

    mockQueryPage.mockImplementationOnce(_ => {
      return TE.of(
        buildIterator(
          RetrievedMessageView,
          aSimpleList.map((m, i) => ({
            ...m,
            status: { ...m.status, archived: i === 0 }
          })),
          _ => {
            iteratorCalls++;
          }
        )
      );
    });

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.some(true),
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseSuccessJson");

    const expectedEnrichedMessage = {
      ...toEnrichedMessageWithContent(dummyThirdPartyDataWithCategoryFetcher)(
        aSimpleList[0],
        false
      ),
      category: {
        rptId: `${aRetrievedService.organizationFiscalCode}177777777777777777`,
        tag: "PAYMENT"
      },
      has_remote_content: false,
      has_precondition: false,
      organization_name: aRetrievedService.organizationName,
      service_name: aRetrievedService.serviceName
    };

    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual({
        items: [
          {
            ...expectedEnrichedMessage,
            id: aSimpleList[0].id,
            is_archived: true
          }
        ],
        prev: aSimpleList[0].id,
        next: undefined
      });
    }

    // We expect it to loop through the whole list
    expect(iteratorCalls).toEqual(Math.round(aSimpleList.length / pageSize));
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should respond with internal error when messages cannot be enriched with service info", async () => {
    let iteratorCalls = 0;

    mockQueryPage.mockImplementationOnce(_ => {
      return TE.of(
        buildIterator(
          RetrievedMessageView,
          aSimpleList.map(m => ({
            ...m,
            status: { ...m.status, archived: true }
          })),
          _ => {
            iteratorCalls++;
          }
        )
      );
    });

    mockFindLastVersionByModelId.mockImplementationOnce(() =>
      TE.left(toCosmosErrorResponse("Any error message"))
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const pageSize = 2 as NonNegativeInteger;

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.some(pageSize),
      O.some(true),
      O.some(true),
      O.none,
      O.none
    );

    expect(result.kind).toBe("IResponseErrorInternal");

    expect(iteratorCalls).toEqual(1);
    expect(functionsContextMock.log.error).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).toHaveBeenCalledWith(
      `Cannot enrich service data | Error: COSMOS_ERROR_RESPONSE, ServiceId=${aSimpleList[0].senderServiceId}`
    );
  });

  it("should respond with query error if it cannot build queryPage iterator", async () => {
    mockQueryPage.mockImplementationOnce(_ =>
      TE.left(toCosmosErrorResponse("Cosmos Error"))
    );

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.none,
      O.none,
      O.none,
      O.none,
      O.none
    );
    expect(result.kind).toBe("IResponseErrorQuery");
    expect(functionsContextMock.log.error).toHaveBeenCalledWith(
      "getMessagesFromView|Error building queryPage iterator"
    );
  });

  it("should respond with query error if it cannot retrieve messages", async () => {
    mockQueryPage.mockImplementationOnce(_ => {
      return TE.of(
        buildIterator(
          RetrievedMessageView,
          aSimpleList,
          _ => {},
          Error("IterationError")
        )
      );
    });

    const getMessagesHandler = GetMessagesHandler(
      getMessagesFunctionSelector,
      serviceModelMock,
      redisClientMock,
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );

    const result = await getMessagesHandler(
      functionsContextMock,
      aFiscalCode,
      O.none,
      O.none,
      O.none,
      O.none,
      O.none
    );
    expect(result.kind).toBe("IResponseErrorQuery");
    expect(functionsContextMock.log.error).toHaveBeenCalledWith(
      `getMessagesFromView|Error retrieving page data from cosmos|{\"error\":{},\"kind\":\"COSMOS_ERROR_RESPONSE\"}`
    );
  });
});

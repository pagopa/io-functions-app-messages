import { MaxAllowedPaymentAmount } from "@pagopa/io-functions-commons/dist/generated/definitions/MaxAllowedPaymentAmount";
import {
  NewService,
  RetrievedService,
  Service,
  ServiceModel,
  toAuthorizedCIDRs,
  toAuthorizedRecipients
} from "@pagopa/io-functions-commons/dist/src/models/service";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";
import { aCosmosResourceMetadata } from "../../__mocks__/mocks";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import { BlobService } from "azure-storage";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import {
  CreatedMessageWithoutContentWithStatus,
  enrichContentData,
  enrichServiceData,
  getThirdPartyDataWithCategoryFetcher,
  mapMessageCategory,
  ThirdPartyDataWithCategoryFetcher
} from "../messages";
import {
  MessageModel,
  NewMessageWithoutContent,
  RetrievedMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import { retrievedMessageToPublic } from "@pagopa/io-functions-commons/dist/src/utils/messages";
import { EnrichedMessage } from "@pagopa/io-functions-commons/dist/generated/definitions/EnrichedMessage";
import { pipe } from "fp-ts/lib/function";
import { Context } from "@azure/functions";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { TagEnum as TagEnumBase } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryBase";
import { TagEnum as TagEnumPayment } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPayment";
import * as redis from "../redis_storage";
import { EnrichedMessageWithContent } from "../../GetMessages/getMessagesFunctions/models";
import { FeatureLevelTypeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/FeatureLevelType";
import { TelemetryClient } from "applicationinsights";
import { IConfig } from "../config";
import { TagEnum as TagEnumPn } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPN";

const dummyThirdPartyDataWithCategoryFetcher: ThirdPartyDataWithCategoryFetcher = jest
  .fn()
  .mockImplementation(_serviceId => ({
    category: TagEnumBase.GENERIC
  }));

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;

const aService: Service = {
  authorizedCIDRs: toAuthorizedCIDRs([]),
  authorizedRecipients: toAuthorizedRecipients([]),
  departmentName: "MyDeptName" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: 0 as MaxAllowedPaymentAmount,
  organizationFiscalCode: anOrganizationFiscalCode,
  organizationName: "MyOrgName" as NonEmptyString,
  requireSecureChannels: false,
  serviceId: "MySubscriptionId" as NonEmptyString,
  serviceName: "MyServiceName" as NonEmptyString
};

const aNewService: NewService = {
  ...aService,
  kind: "INewService"
};

const aRetrievedService: RetrievedService = {
  ...aNewService,
  ...aCosmosResourceMetadata,
  id: "123" as NonEmptyString,
  kind: "IRetrievedService",
  version: 1 as NonNegativeInteger
};

const aFiscalCode = "FRLFRC74E04B157I" as FiscalCode;
const aDate = new Date();

const aNewMessageWithoutContent: NewMessageWithoutContent = {
  createdAt: aDate,
  featureLevelType: FeatureLevelTypeEnum.STANDARD,
  fiscalCode: aFiscalCode,
  id: "A_MESSAGE_ID" as NonEmptyString,
  indexedId: "A_MESSAGE_ID" as NonEmptyString,
  isPending: true,
  kind: "INewMessageWithoutContent",
  senderServiceId: aRetrievedService.serviceId,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

const aRetrievedMessageWithoutContent: RetrievedMessageWithoutContent = {
  ...aNewMessageWithoutContent,
  ...aCosmosResourceMetadata,
  kind: "IRetrievedMessageWithoutContent"
};

const blobServiceMock = ({
  getBlobToText: jest.fn()
} as unknown) as BlobService;

const mockedGenericContent = {
  subject: "a subject",
  markdown: "a markdown"
} as MessageContent;

const mockedGreenPassContent = {
  subject: "a subject".repeat(10),
  markdown: "a markdown".repeat(80),
  eu_covid_cert: {
    auth_code: "an_auth_code"
  }
} as MessageContent;

const mockedLegalDataContent = {
  subject: "a subject".repeat(10),
  markdown: "a markdown".repeat(80),
  legal_data: {
    has_attachment: false,
    message_unique_id: "dummy_mvl_id",
    sender_mail_from: "dummy@sender.it"
  }
} as MessageContent;

const mockedPaymentContent = {
  subject: "a subject".repeat(10),
  markdown: "a markdown".repeat(80),
  payment_data: {
    amount: 1,
    notice_number: "012345678901234567"
  }
} as MessageContent;

const getContentFromBlobMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(mockedGenericContent)));

const messageModelMock = ({
  getContentFromBlob: getContentFromBlobMock
} as unknown) as MessageModel;

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(aRetrievedService)));
const serviceModelMock = ({
  findLastVersionByModelId: findLastVersionByModelIdMock
} as unknown) as ServiceModel;

const functionsContextMock = ({
  log: {
    error: jest.fn(e => console.log(e))
  }
} as unknown) as Context;

const messages: CreatedMessageWithoutContentWithStatus[] = [
  {
    ...retrievedMessageToPublic(aRetrievedMessageWithoutContent),
    is_archived: false,
    is_read: false
  }
];

const messagesWithGenericContent: readonly EnrichedMessageWithContent[] = messages.map(
  m => ({
    ...m,
    id: m.id as NonEmptyString,
    message_title: mockedGenericContent.subject,
    category: mapMessageCategory(
      m,
      mockedGenericContent,
      dummyThirdPartyDataWithCategoryFetcher
    )
  })
);

const messagesWithPaymentContent: EnrichedMessageWithContent[] = messages.map(
  m => ({
    ...m,
    id: m.id as NonEmptyString,
    message_title: mockedPaymentContent.subject,
    category: mapMessageCategory(
      m,
      mockedPaymentContent,
      dummyThirdPartyDataWithCategoryFetcher
    )
  })
);

const setWithExpirationTaskMock = jest
  .fn()
  .mockImplementation(() => TE.of(true));
jest
  .spyOn(redis, "setWithExpirationTask")
  .mockImplementation(setWithExpirationTaskMock);

const getTaskMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(JSON.stringify(aRetrievedService))));
jest.spyOn(redis, "getTask").mockImplementation(getTaskMock);

const aRedisClient = {} as any;
const aServiceCacheTtl = 10 as NonNegativeInteger;

// ------------------------
// Tests
// ------------------------

describe("enrichContentData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return right when message blob is retrieved", async () => {
    const enrichMessages = enrichContentData(
      functionsContextMock,
      messageModelMock,
      blobServiceMock,
      dummyThirdPartyDataWithCategoryFetcher
    );

    const enrichedMessagesPromises = enrichMessages(messages);

    const enrichedMessages = await pipe(
      TE.tryCatch(async () => Promise.all(enrichedMessagesPromises), void 0),
      TE.getOrElse(() => {
        throw Error();
      })
    )();

    enrichedMessages.map(enrichedMessage => {
      expect(E.isRight(enrichedMessage)).toBe(true);
      if (E.isRight(enrichedMessage)) {
        expect(EnrichedMessageWithContent.is(enrichedMessage.right)).toBe(true);
        expect(enrichedMessage.right.category).toEqual({
          tag: TagEnumBase.GENERIC
        });
      }
    });
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
    expect(findLastVersionByModelIdMock).not.toHaveBeenCalled();
  });

  it("should return right with right message EU_COVID_CERT category when message content is retrieved", async () => {
    getContentFromBlobMock.mockImplementationOnce(() =>
      TE.of(O.some(mockedGreenPassContent))
    );
    const enrichMessages = enrichContentData(
      functionsContextMock,
      messageModelMock,
      blobServiceMock,
      dummyThirdPartyDataWithCategoryFetcher
    );

    const enrichedMessagesPromises = enrichMessages(messages);

    const enrichedMessages = await pipe(
      TE.tryCatch(async () => Promise.all(enrichedMessagesPromises), void 0),
      TE.getOrElse(() => {
        throw Error();
      })
    )();

    enrichedMessages.map(enrichedMessage => {
      expect(E.isRight(enrichedMessage)).toBe(true);
      if (E.isRight(enrichedMessage)) {
        expect(EnrichedMessageWithContent.is(enrichedMessage.right)).toBe(true);
        expect(enrichedMessage.right.category).toEqual({
          tag: TagEnumBase.EU_COVID_CERT
        });
      }
    });
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("GIVEN a message with a valid legal_data WHEN a message retrieved from cosmos is enriched THEN the message category must be LEGAL_MESSAGE", async () => {
    getContentFromBlobMock.mockImplementationOnce(() =>
      TE.of(O.some(mockedLegalDataContent))
    );
    const enrichMessages = enrichContentData(
      functionsContextMock,
      messageModelMock,
      blobServiceMock,
      dummyThirdPartyDataWithCategoryFetcher
    );

    const enrichedMessagesPromises = enrichMessages(messages);

    const enrichedMessages = await pipe(
      TE.tryCatch(async () => Promise.all(enrichedMessagesPromises), void 0),
      TE.getOrElse(() => {
        throw Error();
      })
    )();

    enrichedMessages.map(enrichedMessage => {
      expect(E.isRight(enrichedMessage)).toBe(true);
      if (E.isRight(enrichedMessage)) {
        expect(EnrichedMessageWithContent.is(enrichedMessage.right)).toBe(true);
        expect(enrichedMessage.right.category).toEqual({
          tag: TagEnumBase.LEGAL_MESSAGE
        });
      }
    });
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should return right with right PAYMENT category when message content is retrieved", async () => {
    getContentFromBlobMock.mockImplementationOnce(() =>
      TE.of(O.some(mockedPaymentContent))
    );
    const enrichMessages = enrichContentData(
      functionsContextMock,
      messageModelMock,
      blobServiceMock,
      dummyThirdPartyDataWithCategoryFetcher
    );

    const enrichedMessagesPromises = enrichMessages(messages);

    const enrichedMessages = await pipe(
      TE.tryCatch(async () => Promise.all(enrichedMessagesPromises), void 0),
      TE.getOrElse(() => {
        throw Error();
      })
    )();

    enrichedMessages.map(enrichedMessage => {
      expect(E.isRight(enrichedMessage)).toBe(true);
      if (E.isRight(enrichedMessage)) {
        expect(EnrichedMessageWithContent.is(enrichedMessage.right)).toBe(true);
        expect(enrichedMessage.right.category).toEqual({
          tag: TagEnumPayment.PAYMENT,
          noticeNumber: mockedPaymentContent.payment_data.notice_number
        });
      }
    });
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should return left when message model return an error", async () => {
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.right(O.some(aRetrievedService))
    );

    getContentFromBlobMock.mockImplementationOnce(() =>
      TE.left(new Error("GENERIC_ERROR"))
    );

    const enrichMessages = enrichContentData(
      functionsContextMock,
      messageModelMock,
      blobServiceMock,
      dummyThirdPartyDataWithCategoryFetcher
    );

    const enrichedMessagesPromises = enrichMessages(messages);

    const enrichedMessages = await pipe(
      TE.tryCatch(async () => Promise.all(enrichedMessagesPromises), void 0),
      TE.getOrElse(() => {
        throw Error();
      })
    )();

    enrichedMessages.map(enrichedMessage => {
      expect(E.isLeft(enrichedMessage)).toBe(true);
    });

    expect(functionsContextMock.log.error).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).toHaveBeenCalledWith(
      `Cannot enrich message "${aRetrievedMessageWithoutContent.id}" | Error: GENERIC_ERROR`
    );
  });
});

describe("enrichServiceData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return right when service is retrieved from Redis cache", async () => {
    const enrichMessages = enrichServiceData(
      functionsContextMock,
      serviceModelMock,
      aRedisClient,
      aServiceCacheTtl
    );
    const enrichedMessages = await enrichMessages(messagesWithGenericContent)();

    expect(E.isRight(enrichedMessages)).toBe(true);
    if (E.isRight(enrichedMessages)) {
      enrichedMessages.right.map(enrichedMessage => {
        expect(EnrichedMessageWithContent.is(enrichedMessage)).toBe(true);
        expect(enrichedMessage.category).toEqual({
          tag: TagEnumBase.GENERIC
        });
      });
    }
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).not.toHaveBeenCalled();
    expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should return right when  service is retrieved from Cosmos due to cache miss", async () => {
    getTaskMock.mockImplementationOnce(() => TE.of(O.none));
    const enrichMessages = enrichServiceData(
      functionsContextMock,
      serviceModelMock,
      aRedisClient,
      aServiceCacheTtl
    );
    const enrichedMessages = await enrichMessages(messagesWithGenericContent)();

    expect(E.isRight(enrichedMessages)).toBe(true);
    if (E.isRight(enrichedMessages)) {
      enrichedMessages.right.map(enrichedMessage => {
        expect(EnrichedMessageWithContent.is(enrichedMessage)).toBe(true);
        expect(enrichedMessage.category).toEqual({
          tag: TagEnumBase.GENERIC
        });
      });
    }
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(setWithExpirationTaskMock).toHaveBeenCalledTimes(1);
    expect(setWithExpirationTaskMock).toHaveBeenCalledWith(
      aRedisClient,
      aNewMessageWithoutContent.senderServiceId,
      JSON.stringify(aRetrievedService),
      aServiceCacheTtl
    );
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should return right when service is retrieved from Cosmos due to cache unavailability", async () => {
    getTaskMock.mockImplementationOnce(() =>
      TE.left(new Error("Redis unreachable"))
    );
    setWithExpirationTaskMock.mockImplementationOnce(() =>
      TE.left(new Error("Redis unreachable"))
    );
    const enrichMessages = enrichServiceData(
      functionsContextMock,
      serviceModelMock,
      aRedisClient,
      aServiceCacheTtl
    );
    const enrichedMessages = await enrichMessages(messagesWithGenericContent)();

    expect(E.isRight(enrichedMessages)).toBe(true);
    if (E.isRight(enrichedMessages)) {
      enrichedMessages.right.map(enrichedMessage => {
        expect(EnrichedMessageWithContent.is(enrichedMessage)).toBe(true);
        expect(enrichedMessage.category).toEqual({
          tag: TagEnumBase.GENERIC
        });
      });
    }

    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalledTimes(1);
    expect(setWithExpirationTaskMock).toHaveBeenCalledTimes(1);
    expect(setWithExpirationTaskMock).toHaveBeenCalledWith(
      aRedisClient,
      aNewMessageWithoutContent.senderServiceId,
      JSON.stringify(aRetrievedService),
      aServiceCacheTtl
    );
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should return enrich rptId with organizationFiscalCode, when handling a PAYMENT message", async () => {
    const enrichMessages = enrichServiceData(
      functionsContextMock,
      serviceModelMock,
      aRedisClient,
      aServiceCacheTtl
    );
    const enrichedMessages = await enrichMessages(messagesWithPaymentContent)();

    expect(E.isRight(enrichedMessages)).toBe(true);
    if (E.isRight(enrichedMessages)) {
      enrichedMessages.right.map(enrichedMessage => {
        expect(EnrichedMessage.is(enrichedMessage)).toBe(true);
        expect(enrichedMessage.category).toEqual({
          tag: TagEnumPayment.PAYMENT,
          rptId: `${aRetrievedService.organizationFiscalCode}${mockedPaymentContent.payment_data.notice_number}`
        });
      });
    }
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).not.toHaveBeenCalled();
    expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should make one call per each serviceId", async () => {
    const enrichMessages = enrichServiceData(
      functionsContextMock,
      serviceModelMock,
      aRedisClient,
      aServiceCacheTtl
    );
    const enrichedMessages = await enrichMessages(
      messagesWithGenericContent.flatMap(m => [
        m,
        { ...m, sender_service_id: m.sender_service_id }
      ])
    )();

    expect(E.isRight(enrichedMessages)).toBe(true);
    if (E.isRight(enrichedMessages)) {
      enrichedMessages.right.map(enrichedMessage => {
        expect(EnrichedMessageWithContent.is(enrichedMessage)).toBe(true);
        expect(enrichedMessage.category).toEqual({
          tag: TagEnumBase.GENERIC
        });
      });
    }
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).not.toHaveBeenCalled();
    expect(setWithExpirationTaskMock).not.toHaveBeenCalled();
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should return left when service model return a cosmos error", async () => {
    getTaskMock.mockImplementationOnce(() => TE.left("Cache unreachable"));
    findLastVersionByModelIdMock.mockImplementationOnce(() =>
      TE.left(toCosmosErrorResponse("Any error message"))
    );

    const enrichMessages = enrichServiceData(
      functionsContextMock,
      serviceModelMock,
      aRedisClient,
      aServiceCacheTtl
    );
    const enrichedMessages = await enrichMessages(messagesWithGenericContent)();

    expect(E.isLeft(enrichedMessages)).toBe(true);

    expect(functionsContextMock.log.error).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).toHaveBeenCalledWith(
      `Cannot enrich service data | Error: COSMOS_ERROR_RESPONSE, ServiceId=${aRetrievedMessageWithoutContent.senderServiceId}`
    );
  });

  it("should return left when service model return an empty result", async () => {
    getTaskMock.mockImplementationOnce(() => TE.left("Cache unreachable"));
    findLastVersionByModelIdMock.mockImplementationOnce(() => TE.right(O.none));

    const enrichMessages = enrichServiceData(
      functionsContextMock,
      serviceModelMock,
      aRedisClient,
      aServiceCacheTtl
    );
    const enrichedMessages = await enrichMessages(messagesWithGenericContent)();

    expect(E.isLeft(enrichedMessages)).toBe(true);

    expect(functionsContextMock.log.error).toHaveBeenCalledTimes(1);
    expect(functionsContextMock.log.error).toHaveBeenCalledWith(
      `Cannot enrich service data | Error: EMPTY_SERVICE, ServiceId=${aRetrievedMessageWithoutContent.senderServiceId}`
    );
  });
});

const mockTelemetryClient = ({
  trackEvent: jest.fn(),
  trackException: jest.fn()
} as unknown) as TelemetryClient;
const aPnServiceId = "a-pn-service-id" as NonEmptyString;
const dummyConfig = { PN_SERVICE_ID: aPnServiceId } as IConfig;

describe("getThirdPartyDataWithCategoryFetcher", () => {
  it("GIVEN a pn service id WHEN get category fetcher is called THEN return PN category", () => {
    const result = getThirdPartyDataWithCategoryFetcher(
      dummyConfig,
      mockTelemetryClient
    )(aPnServiceId);
    expect(result.category).toEqual(TagEnumPn.PN);
    expect(mockTelemetryClient.trackException).toBeCalledTimes(0);
  });

  it("GIVEN a generic service id WHEN get category fetcher is called THEN return GENERIC category", () => {
    const result = getThirdPartyDataWithCategoryFetcher(
      dummyConfig,
      mockTelemetryClient
    )(aService.serviceId);
    expect(result.category).toEqual(TagEnumBase.GENERIC);
    expect(mockTelemetryClient.trackException).toBeCalledTimes(1);
    expect(mockTelemetryClient.trackException).toBeCalledWith({
      exception: Error(
        `Missing third-party service configuration for ${aService.serviceId}`
      )
    });
  });
});

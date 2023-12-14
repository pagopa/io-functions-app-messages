import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

import { enrichContentData } from "../getMessagesFunctions/getMessages.fallback";
import { redisClientMock } from "../../__mocks__/redis";
import {
  mockRemoteContentConfigurationModel,
  mockRemoteContentConfigurationTtl
} from "../../__mocks__/remote-content";
import { Context } from "@azure/functions";
import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import {
  MessageModel,
  NewMessageWithoutContent,
  RetrievedMessageWithoutContent
} from "@pagopa/io-functions-commons/dist/src/models/message";
import { FeatureLevelTypeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/FeatureLevelType";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { CosmosResource } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { RetrievedService } from "@pagopa/io-functions-commons/dist/src/models/service";
import { TimeToLiveSeconds } from "@pagopa/io-functions-commons/dist/generated/definitions/TimeToLiveSeconds";
import { BlobService } from "azure-storage";
import {
  CreatedMessageWithoutContentWithStatus,
  ThirdPartyDataWithCategoryFetcher
} from "../../utils/messages";
import { TagEnum as TagEnumBase } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryBase";
import { TagEnum as TagEnumPayment } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageCategoryPayment";
import { retrievedMessageToPublic } from "@pagopa/io-functions-commons/dist/src/utils/messages";
import { pipe } from "fp-ts/lib/function";
import { EnrichedMessageWithContent } from "../getMessagesFunctions/models";
import { aMessageContent } from "../../utils/__tests__/messages.test";

const aDate = new Date();
const aFiscalCode = "FRLFRC74E04B157I" as FiscalCode;

// CosmosResourceMetadata
export const aCosmosResourceMetadata: Omit<CosmosResource, "id"> = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};

const aServiceId = "serviceId" as NonEmptyString;

export const aRetrievedService: RetrievedService = ({
  ...aCosmosResourceMetadata,
  serviceId: aServiceId,
  isVisible: true,
  serviceName: "a Service",
  organizationName: "a Organization",
  organizationFiscalCode: "99999999999"
} as any) as RetrievedService;

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

const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(aRetrievedService)));

const blobServiceMock = ({
  getBlobToText: jest.fn()
} as unknown) as BlobService;

const messages = [E.right(aRetrievedMessageWithoutContent)];

const functionsContextMock = ({
  log: {
    error: jest.fn(e => console.log(e))
  }
} as unknown) as Context;

const getMockIterator = values => ({
  next: jest
    .fn()
    .mockImplementationOnce(async () => ({
      value: values
    }))
    .mockImplementationOnce(async () => ({ done: true }))
});

const messageIterator = getMockIterator(messages);

const getContentFromBlobMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(aMessageContent)));

const getMessageModelMock = messageIterator =>
  (({
    getContentFromBlob: getContentFromBlobMock,
    findMessages: jest.fn(() => TE.of(messageIterator))
  } as unknown) as MessageModel);

const messageModelMock = getMessageModelMock(messageIterator);

const dummyThirdPartyDataWithCategoryFetcher: ThirdPartyDataWithCategoryFetcher = jest
  .fn()
  .mockImplementation(_serviceId => ({
    category: TagEnumBase.GENERIC
  }));

const messageList: CreatedMessageWithoutContentWithStatus[] = [
  {
    ...retrievedMessageToPublic(aRetrievedMessageWithoutContent),
    is_archived: false,
    is_read: false
  }
];

const mockedGreenPassContent = {
  subject: "a subject".repeat(10),
  markdown: "a markdown".repeat(80),
  eu_covid_cert: {
    auth_code: "an_auth_code"
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

describe("enrichContentData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return right when message blob is retrieved", async () => {
    const enrichMessages = enrichContentData(
      functionsContextMock,
      messageModelMock,
      blobServiceMock,
      redisClientMock,
      mockRemoteContentConfigurationModel,
      mockRemoteContentConfigurationTtl,
      dummyThirdPartyDataWithCategoryFetcher
    );

    const enrichedMessagesPromises = enrichMessages(messageList);

    pipe;
    const enrichedMessages = await pipe(
      TE.tryCatch(
        async () => Promise.all(enrichedMessagesPromises),
        () => {}
      ),
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
      redisClientMock,
      mockRemoteContentConfigurationModel,
      mockRemoteContentConfigurationTtl,
      dummyThirdPartyDataWithCategoryFetcher
    );

    const enrichedMessagesPromises = enrichMessages(messageList);

    const enrichedMessages = await pipe(
      TE.tryCatch(
        async () => Promise.all(enrichedMessagesPromises),
        () => {}
      ),
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

  it("should return right with right PAYMENT category when message content is retrieved", async () => {
    getContentFromBlobMock.mockImplementationOnce(() =>
      TE.of(O.some(mockedPaymentContent))
    );
    const enrichMessages = enrichContentData(
      functionsContextMock,
      messageModelMock,
      blobServiceMock,
      redisClientMock,
      mockRemoteContentConfigurationModel,
      mockRemoteContentConfigurationTtl,
      dummyThirdPartyDataWithCategoryFetcher
    );

    const enrichedMessagesPromises = enrichMessages(messageList);

    const enrichedMessages = await pipe(
      TE.tryCatch(
        async () => Promise.all(enrichedMessagesPromises),
        () => {}
      ),
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
          noticeNumber: mockedPaymentContent.payment_data?.notice_number
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
      redisClientMock,
      mockRemoteContentConfigurationModel,
      mockRemoteContentConfigurationTtl,
      dummyThirdPartyDataWithCategoryFetcher
    );

    const enrichedMessagesPromises = enrichMessages(messageList);

    const enrichedMessages = await pipe(
      TE.tryCatch(
        async () => Promise.all(enrichedMessagesPromises),
        () => {}
      ),
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

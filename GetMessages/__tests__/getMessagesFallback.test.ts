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
import { MessageModel } from "@pagopa/io-functions-commons/dist/src/models/message";
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
import { HasPreconditionEnum } from "../../generated/definitions/HasPrecondition";
import { aRetrievedService } from "../../__mocks__/mocks.service_preference";
import { aRetrievedMessageWithoutContent } from "../../__mocks__/messages";
import RCConfigurationUtility from "../../utils/remoteContentConfig";
import { Ulid } from "@pagopa/ts-commons/lib/strings";

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

const getMockIterator = (values: any) => ({
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

const getMessageModelMock = (messageIterator: any) =>
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

const mockRCConfigurationUtility = new RCConfigurationUtility(
  redisClientMock,
  mockRemoteContentConfigurationModel,
  mockRemoteContentConfigurationTtl,
  ({ aServiceId: "01HMRBX079WA5SGYBQP1A7FSKH" } as unknown) as ReadonlyMap<
    string,
    Ulid
  >
);

describe("enrichContentData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return right when message blob is retrieved", async () => {
    const enrichMessages = enrichContentData(
      functionsContextMock,
      messageModelMock,
      blobServiceMock,
      mockRCConfigurationUtility,
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
          tag: TagEnumBase.GENERIC
        });
        expect(enrichedMessage.right.has_remote_content).toBeFalsy();
        expect(enrichedMessage.right.has_precondition).toBeFalsy();
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
      mockRCConfigurationUtility,
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
        expect(enrichedMessage.right.has_remote_content).toBeFalsy();
        expect(enrichedMessage.right.has_precondition).toBeFalsy();
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
      mockRCConfigurationUtility,
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
        expect(enrichedMessage.right.has_remote_content).toBeFalsy();
        expect(enrichedMessage.right.has_precondition).toBeFalsy();
      }
    });
    expect(functionsContextMock.log.error).not.toHaveBeenCalled();
  });

  it("should return right with correct third party data flags when message content is retrieved", async () => {
    getContentFromBlobMock.mockImplementationOnce(() =>
      TE.of(
        O.some({
          ...aMessageContent,
          third_party_data: {
            has_remote_content: true,
            has_precondition: HasPreconditionEnum.ALWAYS
          }
        })
      )
    );
    const enrichMessages = enrichContentData(
      functionsContextMock,
      messageModelMock,
      blobServiceMock,
      mockRCConfigurationUtility,
      dummyThirdPartyDataWithCategoryFetcher
    );

    const enrichedMessagesPromises = enrichMessages([
      {
        ...retrievedMessageToPublic(aRetrievedMessageWithoutContent),
        is_archived: false,
        is_read: false
      }
    ]);

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
        expect(enrichedMessage.right.has_remote_content).toBeTruthy();
        expect(enrichedMessage.right.has_precondition).toBeTruthy();
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
      mockRCConfigurationUtility,
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

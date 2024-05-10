import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import {
  aRetrievedRCConfigurationWithBothEnv,
  findByConfigurationIdMock,
  mockConfig,
  mockRCConfigurationModel
} from "../../__mocks__/remote-content";
import * as redis from "../redis_storage";
import RCConfigurationUtility, {
  RC_CONFIGURATION_REDIS_PREFIX
} from "../remoteContentConfig";
import { Ulid } from "@pagopa/ts-commons/lib/strings";

const getTaskMock = jest
  .fn()
  .mockImplementation(() =>
    TE.of(O.some(JSON.stringify(aRetrievedRCConfigurationWithBothEnv)))
  );
jest.spyOn(redis, "getTask").mockImplementation(getTaskMock);

const setTaskMock = jest.fn().mockImplementation(() => TE.of(true));
jest.spyOn(redis, "setWithExpirationTask").mockImplementation(setTaskMock);

const aRedisClient = {} as any;

const mockRCConfigurationUtility = new RCConfigurationUtility(
  aRedisClient,
  mockRCConfigurationModel,
  mockConfig.SERVICE_CACHE_TTL_DURATION,
  ({ aServiceId: "01HMRBX079WA5SGYBQP1A7FSKH" } as unknown) as ReadonlyMap<
    string,
    Ulid
  >
);

describe("getOrCacheMaybeRCConfigurationById", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return a valid aRetrievedRemoteContentConfigurationWithBothEnv without calling the model.findLastVersionByModelIdMock if the getTask works fine", async () => {
    const r = await mockRCConfigurationUtility.getOrCacheMaybeRCConfigurationById(
      aRetrievedRCConfigurationWithBothEnv.configurationId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(setTaskMock).not.toHaveBeenCalled();
    expect(findByConfigurationIdMock).not.toHaveBeenCalled();
  });

  it("should return a valid aRetrievedRemoteContentConfigurationWithBothEnv calling the model.findLastVersionByModelIdMock if the getTask return an error", async () => {
    getTaskMock.mockReturnValueOnce(TE.left(new Error("Error")));

    const r = await mockRCConfigurationUtility.getOrCacheMaybeRCConfigurationById(
      aRetrievedRCConfigurationWithBothEnv.configurationId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(setTaskMock).toHaveBeenCalledWith(
      aRedisClient,
      `${RC_CONFIGURATION_REDIS_PREFIX}-${aRetrievedRCConfigurationWithBothEnv.configurationId}`,
      JSON.stringify(aRetrievedRCConfigurationWithBothEnv),
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );
    expect(findByConfigurationIdMock).toHaveBeenCalled();
  });

  it("should return a valid aRetrievedRemoteContentConfigurationWithBothEnv calling the model.findLastVersionByModelIdMock if the getTask return is empty", async () => {
    getTaskMock.mockReturnValueOnce(TE.of(O.none));

    const r = await mockRCConfigurationUtility.getOrCacheMaybeRCConfigurationById(
      aRetrievedRCConfigurationWithBothEnv.configurationId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(setTaskMock).toHaveBeenCalledWith(
      aRedisClient,
      `${RC_CONFIGURATION_REDIS_PREFIX}-${aRetrievedRCConfigurationWithBothEnv.configurationId}`,
      JSON.stringify(aRetrievedRCConfigurationWithBothEnv),
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );
    expect(findByConfigurationIdMock).toHaveBeenCalled();
  });

  it("should return an error calling the model.find if the getTask and the model.findLastVersionByModelIdMock return is empty", async () => {
    getTaskMock.mockReturnValueOnce(TE.of(O.none));
    findByConfigurationIdMock.mockReturnValueOnce(TE.of(O.none));

    const r = await mockRCConfigurationUtility.getOrCacheMaybeRCConfigurationById(
      aRetrievedRCConfigurationWithBothEnv.configurationId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(setTaskMock).not.toHaveBeenCalled();
    expect(findByConfigurationIdMock).toHaveBeenCalled();
  });

  it("should return a valid aRetrievedRemoteContentConfigurationWithBothEnv calling the model.findLastVersionByModelIdMock if the getTask works fine but the JSON parse fails", async () => {
    getTaskMock.mockReturnValueOnce(
      //without the JSON.stringify we expect that the pasre will fail
      TE.of(O.some(aRetrievedRCConfigurationWithBothEnv))
    );

    const r = await mockRCConfigurationUtility.getOrCacheMaybeRCConfigurationById(
      aRetrievedRCConfigurationWithBothEnv.configurationId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(setTaskMock).toHaveBeenCalledWith(
      aRedisClient,
      `${RC_CONFIGURATION_REDIS_PREFIX}-${aRetrievedRCConfigurationWithBothEnv.configurationId}`,
      JSON.stringify(aRetrievedRCConfigurationWithBothEnv),
      mockConfig.SERVICE_CACHE_TTL_DURATION
    );
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    // the mockFind is called because the parse failed after the getTask,
    // so the value provided by the redis cache is not valid and we call the model
    expect(findByConfigurationIdMock).toHaveBeenCalled();
  });
});

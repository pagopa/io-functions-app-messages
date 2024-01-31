import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import {
  aRetrievedRemoteContentConfigurationWithBothEnv,
  findLastVersionByModelIdMock,
  mockConfig,
  mockRCConfigurationModel,
} from "../../__mocks__/remote-content";
import * as redis from "../redis_storage";
import { getOrCacheMaybeRCConfiguration, getOrCacheRemoteServiceConfig } from "../remoteContentConfig";

const getTaskMock = jest
  .fn()
  .mockImplementation(() =>
    TE.of(O.some(JSON.stringify(aRetrievedRemoteContentConfigurationWithBothEnv)))
  );
jest.spyOn(redis, "getTask").mockImplementation(getTaskMock);

const aRedisClient = {} as any;

describe("getOrCacheRCConfiguration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return a valid aRetrievedRemoteContentConfigurationWithBothEnv without calling the model.find if the getTask works fine", async () => {
    const r = await getOrCacheMaybeRCConfiguration(
      aRedisClient,
      mockRCConfigurationModel as any,
      mockConfig.SERVICE_CACHE_TTL_DURATION,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).not.toHaveBeenCalled();
  });

  it("should return a valid aRetrievedRemoteContentConfigurationWithBothEnv calling the model.find if the getTask return an error", async () => {
    getTaskMock.mockReturnValueOnce(TE.left(new Error("Error")));
    const r = await getOrCacheMaybeRCConfiguration(
      aRedisClient,
      mockRCConfigurationModel as any,
      mockConfig.SERVICE_CACHE_TTL_DURATION,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
  });

  it("should return a valid aRetrievedRemoteContentConfigurationWithBothEnv calling the model.find if the getTask return is empty", async () => {
    getTaskMock.mockReturnValueOnce(TE.of(O.none));
    const r = await getOrCacheMaybeRCConfiguration(
      aRedisClient,
      mockRCConfigurationModel as any,
      mockConfig.SERVICE_CACHE_TTL_DURATION,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
  });

  it("should return an error calling the model.find if the getTask and the model.find return is empty", async () => {
    getTaskMock.mockReturnValueOnce(TE.of(O.none));
    findLastVersionByModelIdMock.mockReturnValueOnce(TE.of(O.none));
    const r = await getOrCacheMaybeRCConfiguration(
      aRedisClient,
      mockRCConfigurationModel as any,
      mockConfig.SERVICE_CACHE_TTL_DURATION,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
  });

  it("should return a valid aRetrievedRemoteContentConfigurationWithBothEnv calling the model.find if the getTask works fine but the JSON parse fails", async () => {
    getTaskMock.mockReturnValueOnce(
      //without the JSON.stringify we expect that the pasre will fail
      TE.of(O.some(aRetrievedRemoteContentConfigurationWithBothEnv))
    );
    const r = await getOrCacheMaybeRCConfiguration(
      aRedisClient,
      mockRCConfigurationModel as any,
      mockConfig.SERVICE_CACHE_TTL_DURATION,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    // the mockFind is called because the parse failed after the getTask,
    // so the value provided by the redis cache is not valid and we call the model
    expect(findLastVersionByModelIdMock).toHaveBeenCalled();
  });
});

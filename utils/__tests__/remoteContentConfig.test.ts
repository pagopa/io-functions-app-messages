import * as TE from "fp-ts/lib/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import {
  aRetrievedRemoteContentConfiguration,
  mockFind,
  mockRemoteContentConfigurationModel,
  mockRemoteContentConfigurationTtl
} from "../../__mocks__/remote-content";
import * as redis from "../redis_storage";
import { aServiceId } from "../../__mocks__/mocks.service_preference";
import { getOrCacheRemoteServiceConfig } from "../remoteContentConfig";

const getTaskMock = jest
  .fn()
  .mockImplementation(() =>
    TE.of(O.some(JSON.stringify(aRetrievedRemoteContentConfiguration)))
  );
jest.spyOn(redis, "getTask").mockImplementation(getTaskMock);

const aRedisClient = {} as any;

describe("getOrCacheRemoteServiceConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return a valid aRetrievedRemoteContentConfiguration without calling the model.find if the getTask works fine", async () => {
    const r = await getOrCacheRemoteServiceConfig(
      aRedisClient,
      mockRemoteContentConfigurationModel,
      mockRemoteContentConfigurationTtl,
      aServiceId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it("should return a valid aRetrievedRemoteContentConfiguration calling the model.find if the getTask return an error", async () => {
    getTaskMock.mockReturnValueOnce(TE.left(new Error("Error")));
    const r = await getOrCacheRemoteServiceConfig(
      aRedisClient,
      mockRemoteContentConfigurationModel,
      mockRemoteContentConfigurationTtl,
      aServiceId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(mockFind).toHaveBeenCalled();
  });

  it("should return a valid aRetrievedRemoteContentConfiguration calling the model.find if the getTask return is empty", async () => {
    getTaskMock.mockReturnValueOnce(TE.of(O.none));
    const r = await getOrCacheRemoteServiceConfig(
      aRedisClient,
      mockRemoteContentConfigurationModel,
      mockRemoteContentConfigurationTtl,
      aServiceId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(mockFind).toHaveBeenCalled();
  });

  it("should return an error calling the model.find if the getTask and the model.find return is empty", async () => {
    getTaskMock.mockReturnValueOnce(TE.of(O.none));
    mockFind.mockReturnValueOnce(TE.of(O.none));
    const r = await getOrCacheRemoteServiceConfig(
      aRedisClient,
      mockRemoteContentConfigurationModel,
      mockRemoteContentConfigurationTtl,
      aServiceId
    )();

    expect(E.isLeft(r)).toBeTruthy();
    if (E.isLeft(r)) expect(r.left).toBeInstanceOf(Error);
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    expect(mockFind).toHaveBeenCalled();
  });

  it("should return a valid aRetrievedRemoteContentConfiguration calling the model.find if the getTask works fine but the JSON parse fails", async () => {
    getTaskMock.mockReturnValueOnce(
      //without the JSON.stringify we expect that the pasre will fail
      TE.of(O.some(aRetrievedRemoteContentConfiguration))
    );
    const r = await getOrCacheRemoteServiceConfig(
      aRedisClient,
      mockRemoteContentConfigurationModel,
      mockRemoteContentConfigurationTtl,
      aServiceId
    )();

    expect(E.isRight(r)).toBeTruthy();
    expect(getTaskMock).toHaveBeenCalledTimes(1);
    // the mockFind is called because the parse failed after the getTask,
    // so the value provided by the redis cache is not valid and we call the model
    expect(mockFind).toHaveBeenCalled();
  });
});

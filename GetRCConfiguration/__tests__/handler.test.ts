// eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-duplicate-string, sonar/sonar-max-lines-per-function

import * as O from "fp-ts/lib/Option";

import * as TE from "fp-ts/lib/TaskEither";
import { context as contextMock } from "../../__mocks__/context";
import { GetRCConfigurationHandler } from "../handler";
import * as rCConfigurationUtils from "../../utils/remoteContentConfig";
import { aRetrievedRemoteContentConfigurationWithBothEnv, mockConfig, mockRCConfigurationModel } from "../../__mocks__/remote-content";

const getOrCacheMaybeRCConfigurationMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(aRetrievedRemoteContentConfigurationWithBothEnv)));

jest
  .spyOn(rCConfigurationUtils, "getOrCacheMaybeRCConfiguration")
  .mockImplementation(getOrCacheMaybeRCConfigurationMock);

describe("GetRCConfigurationHandler", () => {
  afterEach(() => jest.clearAllMocks());
  it("should fail if any error occurs trying to retrieve the remote content configuration", async () => {
    getOrCacheMaybeRCConfigurationMock.mockImplementationOnce(() => TE.left(new Error()));

    const getRCConfigurationHandler = GetRCConfigurationHandler(
      mockRCConfigurationModel as any,
      {} as any,
      mockConfig.REMOTE_CONFIGURATION_CACHE_TTL_DURATION
    );

    const result = await getRCConfigurationHandler(
      contextMock as any,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    );

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should fail with Not Found if no configuration is found with the requested id", async () => {
    getOrCacheMaybeRCConfigurationMock.mockImplementationOnce(() => TE.of(O.none));

    const getRCConfigurationHandler = GetRCConfigurationHandler(
      mockRCConfigurationModel as any,
      {} as any,
      mockConfig.REMOTE_CONFIGURATION_CACHE_TTL_DURATION
    );

    const result = await getRCConfigurationHandler(
      contextMock as any,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    );

    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should respond with the requested remote content configuration", async () => {
    const getRCConfigurationHandler = GetRCConfigurationHandler(
      mockRCConfigurationModel as any,
      {} as any,
      mockConfig.REMOTE_CONFIGURATION_CACHE_TTL_DURATION
    );

    const result = await getRCConfigurationHandler(
      contextMock as any,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual(aRetrievedRemoteContentConfigurationWithBothEnv);
    }
  });
});

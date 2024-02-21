// eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-duplicate-string, sonar/sonar-max-lines-per-function
import { context as contextMock } from "../../__mocks__/context";
import { GetRCConfigurationHandler } from "../handler";
import RCConfigurationUtility from "../../utils/remoteContentConfig";
import {
  aRemoteContentConfigurationWithBothEnv,
  aRetrievedRemoteContentConfigurationWithBothEnv
} from "../../__mocks__/remote-content";
import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";


const getOrCacheMaybeRCConfigurationByIdMock = jest
  .fn()
  .mockReturnValue(
    TE.right(O.some(aRetrievedRemoteContentConfigurationWithBothEnv))
  );

const mockRCConfigurationUtility = ({
  getOrCacheRCConfigurationWithFallback: jest.fn(), // not used for this handler
  getOrCacheMaybeRCConfigurationById: getOrCacheMaybeRCConfigurationByIdMock
} as unknown) as RCConfigurationUtility;

describe("GetRCConfigurationHandler", () => {
  afterEach(() => jest.clearAllMocks());
  it("should fail if any error occurs trying to retrieve the remote content configuration", async () => {
    getOrCacheMaybeRCConfigurationByIdMock.mockReturnValueOnce(TE.left(new Error("Any error")))

    const getRCConfigurationHandler = GetRCConfigurationHandler(
      mockRCConfigurationUtility
    );

    const result = await getRCConfigurationHandler(
      contextMock as any,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    );

    expect(result.kind).toBe("IResponseErrorInternal");
  });

  it("should fail with Not Found if no configuration is found with the requested id", async () => {
    getOrCacheMaybeRCConfigurationByIdMock.mockReturnValueOnce(TE.right(O.none))

    const getRCConfigurationHandler = GetRCConfigurationHandler(
      mockRCConfigurationUtility
    );

    const result = await getRCConfigurationHandler(
      contextMock as any,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    );

    expect(result.kind).toBe("IResponseErrorNotFound");
  });

  it("should respond with the requested remote content configuration", async () => {
    const getRCConfigurationHandler = GetRCConfigurationHandler(
      mockRCConfigurationUtility
    );

    const result = await getRCConfigurationHandler(
      contextMock as any,
      aRetrievedRemoteContentConfigurationWithBothEnv.configurationId
    );

    expect(result.kind).toBe("IResponseSuccessJson");
    if (result.kind === "IResponseSuccessJson") {
      expect(result.value).toEqual(aRemoteContentConfigurationWithBothEnv);
    }
  });
});

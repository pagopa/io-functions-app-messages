// eslint-disable @typescript-eslint/no-explicit-any, sonarjs/no-duplicate-string, sonar/sonar-max-lines-per-function

import * as O from "fp-ts/lib/Option";

import * as TE from "fp-ts/lib/TaskEither";
import { context as contextMock } from "../../__mocks__/context";
import { GetRCConfigurationHandler } from "../handler";
import RCConfigurationUtility, * as rCConfigurationUtils from "../../utils/remoteContentConfig";
import {
  aRemoteContentConfigurationWithBothEnv,
  aRetrievedRemoteContentConfigurationWithBothEnv,
  mockConfig,
  mockRemoteContentConfigurationModel
} from "../../__mocks__/remote-content";
import { Ulid } from "@pagopa/ts-commons/lib/strings";
import * as redis from "../../utils/redis_storage";

const getTaskMock = jest
  .fn()
  .mockImplementation(() =>
    TE.of(
      O.some(JSON.stringify(aRetrievedRemoteContentConfigurationWithBothEnv))
    )
  );
jest.spyOn(redis, "getTask").mockImplementation(getTaskMock);

const aRedisClient = {} as any;

const mockRCConfigurationUtility = new RCConfigurationUtility(
  aRedisClient,
  mockRemoteContentConfigurationModel,
  mockConfig.SERVICE_CACHE_TTL_DURATION,
  ({ aServiceId: "01HMRBX079WA5SGYBQP1A7FSKH" } as unknown) as ReadonlyMap<
    string,
    Ulid
  >
);

describe("GetRCConfigurationHandler", () => {
  afterEach(() => jest.clearAllMocks());
  it("should fail if any error occurs trying to retrieve the remote content configuration", async () => {
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

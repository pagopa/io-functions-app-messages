import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

import { Has_preconditionEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ThirdPartyData";
import {
  RemoteContentConfigurationModel,
  RetrievedRemoteContentConfiguration
} from "@pagopa/io-functions-commons/dist/src/models/remote_content_configuration";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString, Ulid } from "@pagopa/ts-commons/lib/strings";
import { aCosmosResourceMetadata, aFiscalCode } from "./mocks";
import { RCConfiguration, RCConfigurationBase, RetrievedRCConfiguration } from "@pagopa/io-functions-commons/dist/src/models/rc_configuration";
import { IConfig } from "../utils/config";

export const mockFind = jest.fn(() =>
  TE.of(O.some(aRetrievedRemoteContentConfiguration))
);

export const mockRemoteContentConfigurationModel = ({
  find: mockFind
} as unknown) as RemoteContentConfigurationModel;

export const mockRemoteContentConfigurationTtl = 100 as NonNegativeInteger;

const aDetailAuthentication = {
  headerKeyName: "a" as NonEmptyString,
  key: "key" as NonEmptyString,
  type: "type" as NonEmptyString
};

export const aRetrievedRemoteContentConfiguration: RetrievedRemoteContentConfiguration = {
  hasPrecondition: Has_preconditionEnum.ALWAYS,
  disableLollipopFor: [aFiscalCode],
  isLollipopEnabled: true,
  id: "id" as NonEmptyString,
  serviceId: "serviceId" as NonEmptyString,
  prodEnvironment: {
    baseUrl: "aValidUrl" as NonEmptyString,
    detailsAuthentication: aDetailAuthentication
  },
  ...aCosmosResourceMetadata
};

export const mockConfig = { REMOTE_CONFIGURATION_CACHE_TTL_DURATION: 3600 } as IConfig;

export const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() => TE.of(O.some(aRetrievedRemoteContentConfigurationWithBothEnv)));

export const mockRCConfigurationModel = {
  findLastVersionByModelId: findLastVersionByModelIdMock
};

const aRemoteContentEnvironmentConfiguration = {
  baseUrl: "https://anydomain.anytld/api/v1/anyapi" as NonEmptyString,
  detailsAuthentication: {
    headerKeyName: "X-Functions-Key" as NonEmptyString,
    key: "anykey" as NonEmptyString,
    type: "API_KEY" as NonEmptyString
  }
};

const aRemoteContentConfigurationWithNoEnv: RCConfigurationBase = {
  userId: "aUserId" as NonEmptyString,
  configurationId: "01HMRBX079WA5SGYBQP1A7FSKH" as Ulid,
  name: "aName" as NonEmptyString,
  description: "a simple description" as NonEmptyString,
  hasPrecondition: Has_preconditionEnum.ALWAYS,
  disableLollipopFor: [],
  isLollipopEnabled: false
};

const aRemoteContentConfigurationWithProdEnv: RCConfiguration = {
  ...aRemoteContentConfigurationWithNoEnv,
  prodEnvironment: aRemoteContentEnvironmentConfiguration
};

const aRemoteContentConfigurationWithBothEnv: RCConfiguration = {
  ...aRemoteContentConfigurationWithNoEnv,
  prodEnvironment: aRemoteContentEnvironmentConfiguration,
  testEnvironment: {
    ...aRemoteContentEnvironmentConfiguration,
    testUsers: []
  }
};

export const aRetrievedRemoteContentConfigurationWithBothEnv: RetrievedRCConfiguration = {
  ...aRemoteContentConfigurationWithBothEnv,
  id: `${aRemoteContentConfigurationWithProdEnv.configurationId}-${"0".repeat(
    16
  )}` as NonEmptyString,
  version: 0 as NonNegativeInteger,
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};


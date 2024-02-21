import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

import { HasPreconditionEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/HasPrecondition";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString, Ulid } from "@pagopa/ts-commons/lib/strings";
import { aCosmosResourceMetadata, aFiscalCode } from "./mocks";
import { IConfig } from "../utils/config";
import { RCConfigurationBase } from "../generated/definitions/RCConfigurationBase";
import { RCConfigurationPublic } from "../generated/definitions/RCConfigurationPublic";
import {
  RCConfiguration,
  RCConfigurationModel,
  RetrievedRCConfiguration
} from "@pagopa/io-functions-commons/dist/src/models/rc_configuration";

export const mockRemoteContentConfigurationTtl = 100 as NonNegativeInteger;

const aDetailAuthentication = {
  headerKeyName: "a" as NonEmptyString,
  key: "key" as NonEmptyString,
  type: "type" as NonEmptyString
};

export const aRetrievedRemoteContentConfiguration: RetrievedRCConfiguration = {
  configurationId: "01HMRBX079WA5SGYBQP1A7FSKH" as Ulid,
  userId: "01HMRBX079WA5SGYBQP1A7FSKK" as NonEmptyString,
  hasPrecondition: HasPreconditionEnum.ALWAYS,
  disableLollipopFor: [aFiscalCode],
  isLollipopEnabled: true,
  id: "id" as NonEmptyString,
  name: "name" as NonEmptyString,
  description: "description" as NonEmptyString,
  prodEnvironment: {
    baseUrl: "aValidUrl" as NonEmptyString,
    detailsAuthentication: aDetailAuthentication
  },
  version: 0 as NonNegativeInteger,
  ...aCosmosResourceMetadata
};

export const mockConfig = { SERVICE_CACHE_TTL_DURATION: 3600 } as IConfig;

export const findLastVersionByModelIdMock = jest
  .fn()
  .mockImplementation(() =>
    TE.of(O.some(aRetrievedRemoteContentConfigurationWithBothEnv))
  );

export const mockFind = jest.fn(() =>
  TE.of(O.some(aRetrievedRemoteContentConfiguration))
);

export const mockRemoteContentConfigurationModel = ({
  find: mockFind,
  findLastVersionByModelId: findLastVersionByModelIdMock
} as unknown) as RCConfigurationModel;

export const mockRCConfigurationModel = ({
  findLastVersionByModelId: findLastVersionByModelIdMock
} as unknown) as RCConfigurationModel;

const aRemoteContentEnvironmentConfiguration = {
  base_url: "https://anydomain.anytld/api/v1/anyapi" as NonEmptyString,
  details_authentication: {
    header_key_name: "X-Functions-Key" as NonEmptyString,
    key: "anykey" as NonEmptyString,
    type: "API_KEY" as NonEmptyString
  }
};

const aRemoteContentConfigurationWithNoEnv: RCConfigurationBase = {
  configuration_id: "01HMRBX079WA5SGYBQP1A7FSKH" as Ulid,
  name: "aName" as NonEmptyString,
  description: "a simple description" as NonEmptyString,
  has_precondition: HasPreconditionEnum.ALWAYS,
  disable_lollipop_for: [],
  is_lollipop_enabled: false
};

export const aRemoteContentConfigurationWithProdEnv: RCConfigurationPublic = {
  ...aRemoteContentConfigurationWithNoEnv,
  prod_environment: aRemoteContentEnvironmentConfiguration
};

export const aRemoteContentConfigurationWithBothEnv: RCConfigurationPublic = {
  ...aRemoteContentConfigurationWithNoEnv,
  prod_environment: aRemoteContentEnvironmentConfiguration,
  test_environment: {
    ...aRemoteContentEnvironmentConfiguration,
    test_users: []
  }
};

const aRemoteContentConfigurationEnvironmentModel = {
  baseUrl: "https://anydomain.anytld/api/v1/anyapi" as NonEmptyString,
  detailsAuthentication: {
    headerKeyName: "X-Functions-Key" as NonEmptyString,
    key: "anykey" as NonEmptyString,
    type: "API_KEY" as NonEmptyString
  }
};

const aRemoteContentConfigurationModel: RCConfiguration = {
  userId: "aUserId" as NonEmptyString,
  configurationId: "01HMRBX079WA5SGYBQP1A7FSKH" as Ulid,
  name: "aName" as NonEmptyString,
  description: "a simple description" as NonEmptyString,
  hasPrecondition: HasPreconditionEnum.ALWAYS,
  disableLollipopFor: [],
  isLollipopEnabled: false,
  prodEnvironment: aRemoteContentConfigurationEnvironmentModel,
  testEnvironment: {
    ...aRemoteContentConfigurationEnvironmentModel,
    testUsers: []
  }
};

export const aRetrievedRemoteContentConfigurationWithBothEnv: RetrievedRCConfiguration = {
  ...aRemoteContentConfigurationModel,
  id: `${aRemoteContentConfigurationModel.configurationId}-${"0".repeat(
    16
  )}` as NonEmptyString,
  version: 0 as NonNegativeInteger,
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};

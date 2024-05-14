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

export const mockRCConfigurationTtl = 100 as NonNegativeInteger;

const aDetailAuthentication = {
  headerKeyName: "a" as NonEmptyString,
  key: "key" as NonEmptyString,
  type: "type" as NonEmptyString
};

export const aRetrievedRCConfiguration: RetrievedRCConfiguration = {
  configurationId: "01HMRBX079WA5SGYBQP1A7FSKH" as Ulid,
  userId: "01HMRBX079WA5SGYBQP1A7FSKK" as NonEmptyString,
  hasPrecondition: HasPreconditionEnum.ALWAYS,
  disableLollipopFor: [aFiscalCode],
  isLollipopEnabled: true,
  id: "01HMRBX079WA5SGYBQP1A7FSKH" as NonEmptyString,
  name: "name" as NonEmptyString,
  description: "description" as NonEmptyString,
  prodEnvironment: {
    baseUrl: "aValidUrl" as NonEmptyString,
    detailsAuthentication: aDetailAuthentication
  },
  ...aCosmosResourceMetadata
};

export const mockConfig = { SERVICE_CACHE_TTL_DURATION: 3600 } as IConfig;

export const findByConfigurationIdMock = jest
  .fn()
  .mockImplementation(() =>
    TE.of(O.some(aRetrievedRCConfigurationWithBothEnv))
  );

export const mockFind = jest.fn(() =>
  TE.of(O.some(aRetrievedRCConfiguration))
);

export const mockRCConfigurationModel = ({
  find: mockFind,
  findByConfigurationId: findByConfigurationIdMock
} as unknown) as RCConfigurationModel;

const aRCEnvironmentConfiguration = {
  base_url: "https://anydomain.anytld/api/v1/anyapi" as NonEmptyString,
  details_authentication: {
    header_key_name: "X-Functions-Key" as NonEmptyString,
    key: "anykey" as NonEmptyString,
    type: "API_KEY" as NonEmptyString
  }
};

const aRCConfigurationWithNoEnv: RCConfigurationBase = {
  configuration_id: "01HMRBX079WA5SGYBQP1A7FSKH" as Ulid,
  name: "aName" as NonEmptyString,
  description: "a simple description" as NonEmptyString,
  has_precondition: HasPreconditionEnum.ALWAYS,
  disable_lollipop_for: [],
  is_lollipop_enabled: false
};

export const aRCConfigurationWithProdEnv: RCConfigurationPublic = {
  ...aRCConfigurationWithNoEnv,
  prod_environment: aRCEnvironmentConfiguration
};

export const aRCConfigurationWithBothEnv: RCConfigurationPublic = {
  ...aRCConfigurationWithNoEnv,
  prod_environment: aRCEnvironmentConfiguration,
  test_environment: {
    ...aRCEnvironmentConfiguration,
    test_users: []
  }
};

const aRCConfigurationEnvironmentModel = {
  baseUrl: "https://anydomain.anytld/api/v1/anyapi" as NonEmptyString,
  detailsAuthentication: {
    headerKeyName: "X-Functions-Key" as NonEmptyString,
    key: "anykey" as NonEmptyString,
    type: "API_KEY" as NonEmptyString
  }
};

const aRCConfiguration: RCConfiguration = {
  userId: "aUserId" as NonEmptyString,
  id: "01HMRBX079WA5SGYBQP1A7FSKH" as NonEmptyString,
  configurationId: "01HMRBX079WA5SGYBQP1A7FSKH" as Ulid,
  name: "aName" as NonEmptyString,
  description: "a simple description" as NonEmptyString,
  hasPrecondition: HasPreconditionEnum.ALWAYS,
  disableLollipopFor: [],
  isLollipopEnabled: false,
  prodEnvironment: aRCConfigurationEnvironmentModel,
  testEnvironment: {
    ...aRCConfigurationEnvironmentModel,
    testUsers: []
  }
};

export const aRetrievedRCConfigurationWithBothEnv: RetrievedRCConfiguration = {
  ...aRCConfiguration,
  id: `${aRCConfiguration.configurationId}` as NonEmptyString,
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};

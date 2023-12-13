import { Has_preconditionEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ThirdPartyData";
import {
  RemoteContentConfigurationModel,
  RetrievedRemoteContentConfiguration
} from "@pagopa/io-functions-commons/dist/src/models/remote_content_configuration";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { aCosmosResourceMetadata, aFiscalCode } from "./mocks";

export const mockFind = jest.fn();

export const mockRemoteContentConfigurationModel = ({
  find: mockFind
} as unknown) as RemoteContentConfigurationModel;
export const setMock = jest
  .fn()
  .mockImplementation((_, __, ___, ____, cb) => cb(undefined, "OK"));

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

import { ServiceScopeEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceScope";
import { StandardServiceCategoryEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/StandardServiceCategory";
import { Has_preconditionEnum } from "@pagopa/io-functions-commons/dist/generated/definitions/ThirdPartyData";
import { RemoteContentConfiguration } from "@pagopa/io-functions-commons/dist/src/models/remote_content_configuration";
import { ServiceMetadata } from "@pagopa/io-functions-commons/dist/src/models/service";
import { toAuthorizedRecipients } from "@pagopa/io-functions-commons/dist/src/models/service";
import { NewService } from "@pagopa/io-functions-commons/dist/src/models/service";
import { toAuthorizedCIDRs } from "@pagopa/io-functions-commons/dist/src/models/service";
import { Service } from "@pagopa/io-functions-commons/dist/src/models/service";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { OrganizationFiscalCode } from "@pagopa/ts-commons/lib/strings";

export const aServiceID = "01HJ0VS18VBAQKCQ337YDV27B5" as NonEmptyString;

const anOrganizationFiscalCode = "01234567890" as OrganizationFiscalCode;
const aTokenName = "TOKEN_NAME" as NonEmptyString;
const someServicesMetadata: ServiceMetadata = {
  category: StandardServiceCategoryEnum.STANDARD,
  customSpecialFlow: undefined,
  scope: ServiceScopeEnum.NATIONAL,
  tokenName: aTokenName
};

export const aService: Service = {
  authorizedCIDRs: toAuthorizedCIDRs([]),
  authorizedRecipients: toAuthorizedRecipients([]),
  departmentName: "MyDeptName" as NonEmptyString,
  isVisible: true,
  maxAllowedPaymentAmount: 0 as Service["maxAllowedPaymentAmount"],
  organizationFiscalCode: anOrganizationFiscalCode,
  organizationName: "MyOrgName" as NonEmptyString,
  requireSecureChannels: false,
  serviceId: aServiceID,
  serviceName: "MyServiceName" as NonEmptyString,
  ...someServicesMetadata
};

export const aNewService: NewService = {
  ...aService,
  kind: "INewService"
};

const aDetailAuthentication = {
  headerKeyName: "a" as NonEmptyString,
  key: "key" as NonEmptyString,
  type: "type" as NonEmptyString
};

export const aRemoteContentConfiguration: RemoteContentConfiguration = {
  hasPrecondition: Has_preconditionEnum.ALWAYS,
  disableLollipopFor: [],
  isLollipopEnabled: true,
  id: "id" as NonEmptyString,
  serviceId: aServiceID,
  prodEnvironment: {
    baseUrl: "aValidUrl" as NonEmptyString,
    detailsAuthentication: aDetailAuthentication
  }
};

export const aRemoteContentConfigurationList = [aRemoteContentConfiguration];

export const serviceList = [aNewService];

import {
  NotificationChannel,
  NotificationChannelEnum
} from "@pagopa/io-functions-commons/dist/generated/definitions/NotificationChannel";
import { ServicePublic } from "@pagopa/io-functions-commons/dist/generated/definitions/ServicePublic";
import { RetrievedService } from "@pagopa/io-functions-commons/dist/src/models/service";
import { toApiServiceMetadata } from "@pagopa/io-functions-commons/dist/src/utils/service_metadata";

export const serviceAvailableNotificationChannels = (
  retrievedService: RetrievedService
): ReadonlyArray<NotificationChannel> =>
  retrievedService.requireSecureChannels
    ? [NotificationChannelEnum.WEBHOOK]
    : [NotificationChannelEnum.EMAIL, NotificationChannelEnum.WEBHOOK];

/**
 * Converts a retrieved service to a service that can be shared via API
 */
export const retrievedServiceToPublic = (
  retrievedService: RetrievedService
): ServicePublic => ({
  available_notification_channels: serviceAvailableNotificationChannels(
    retrievedService
  ),
  department_name: retrievedService.departmentName,
  organization_fiscal_code: retrievedService.organizationFiscalCode,
  organization_name: retrievedService.organizationName,
  service_id: retrievedService.serviceId,
  service_metadata: retrievedService.serviceMetadata
    ? toApiServiceMetadata(retrievedService.serviceMetadata)
    : undefined,
  service_name: retrievedService.serviceName,
  version: retrievedService.version
});

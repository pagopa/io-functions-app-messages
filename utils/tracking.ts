import { FiscalCode } from "@pagopa/io-functions-commons/dist/generated/definitions/FiscalCode";
import { ServiceId } from "@pagopa/io-functions-commons/dist/generated/definitions/ServiceId";
import { EventTelemetry } from "applicationinsights/out/Declarations/Contracts";
import { initTelemetryClient } from "./appinsights";
import { toHash } from "./crypto";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const createTracker = (
  telemetryClient: ReturnType<typeof initTelemetryClient>
) => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const trackEnrichmentFailure = (
    kind: "SERVICE" | "CONTENT" | "STATUS",
    fiscalCode: FiscalCode,
    messageId: string,
    serviceId?: ServiceId
  ) => {
    telemetryClient.trackEvent({
      name: "messages.enrichMessages.failure",
      properties: {
        fiscalCode: toHash(fiscalCode),
        kind,
        messageId,
        serviceId
      },
      tagOverrides: { samplingEnabled: "false" }
    } as EventTelemetry);
  };

  return {
    messages: {
      trackEnrichmentFailure
    }
  };
};

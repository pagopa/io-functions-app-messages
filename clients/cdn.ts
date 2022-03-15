import { CdnManagementClient } from "@azure/arm-cdn";
import { ClientSecretCredential } from "@azure/identity";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import { dummyCdnPurger, purgeCdnEndpointPaths } from "../utils/cdn";
import { getConfigOrThrow, IConfig } from "../utils/config";
const config = getConfigOrThrow();

const CdnPurgeEnabledTg = (
  conf: IConfig
): conf is IConfig & { readonly ENABLE_CDN_PURGE: true } =>
  conf.ENABLE_CDN_PURGE;

export const getCdnContentPurger = (): ReturnType<typeof purgeCdnEndpointPaths> =>
  pipe(
    config,
    O.fromPredicate(CdnPurgeEnabledTg),
    O.map(cfg =>
      pipe(
        new CdnManagementClient(
          new ClientSecretCredential(
            cfg.CDN_AZURE_TENANT_ID,
            cfg.CDN_AZURE_CLIENT_ID,
            cfg.CDN_AZURE_CLIENT_SECRET
          ),
          cfg.CDN_SUBSCRIPTION_ID
        ),
        cdnManagementClient =>
          purgeCdnEndpointPaths(
            cdnManagementClient,
            cfg.CDN_RESOURCE_GROUP_NAME,
            cfg.CDN_PROFILE_NAME,
            cfg.CDN_ASSETS_ENDPOINT_NAME
          )
      )
    ),
    O.getOrElse(() => dummyCdnPurger)
  );

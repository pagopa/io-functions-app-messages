/**
 * Config module
 *
 * Single point of access for the application confguration. Handles validation on required environment variables.
 * The configuration is evaluate eagerly at the first access to the module. The module exposes convenient methods to access such value.
 */

import * as t from "io-ts";

import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import { pipe } from "fp-ts/lib/function";

import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";

// exclude a specific value from a type
// as strict equality is performed, allowed input types are constrained to be values not references (object, arrays, etc)
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const AnyBut = <A extends string | number | boolean | symbol, Out = A>(
  but: A,
  base: t.Type<A, Out> = t.any
) =>
  t.brand(
    base,
    (
      s
    ): s is t.Branded<
      t.TypeOf<typeof base>,
      { readonly AnyBut: unique symbol }
    > => s !== but,
    "AnyBut"
  );

// configuration for REQ_SERVICE_ID in dev
export type ReqServiceIdConfig = t.TypeOf<typeof ReqServiceIdConfig>;
export const ReqServiceIdConfig = t.union([
  t.interface({
    NODE_ENV: t.literal("production"),
    REQ_SERVICE_ID: t.undefined
  }),
  t.interface({
    NODE_ENV: AnyBut("production", t.string),
    REQ_SERVICE_ID: NonEmptyString
  })
]);

// configuration for REQ_SERVICE_ID in dev
export type CdnConfig = t.TypeOf<typeof CdnConfig>;
export const CdnConfig = t.union([
  t.interface({
    CDN_ASSETS_ENDPOINT_NAME: NonEmptyString,
    CDN_AZURE_CLIENT_ID: NonEmptyString,
    CDN_AZURE_CLIENT_SECRET: NonEmptyString,
    CDN_AZURE_TENANT_ID: NonEmptyString,
    CDN_PROFILE_NAME: NonEmptyString,
    CDN_RESOURCE_GROUP_NAME: NonEmptyString,
    CDN_SERVICE_BASE_PATH: NonEmptyString,
    CDN_SUBSCRIPTION_ID: NonEmptyString,
    ENABLE_CDN_PURGE: t.literal(true)
  }),
  t.interface({
    CDN_SERVICE_BASE_PATH: NonEmptyString,
    ENABLE_CDN_PURGE: t.literal(false)
  })
]);

// global app configuration
export type IConfig = t.TypeOf<typeof IConfig>;
export const IConfig = t.intersection([
  t.interface({
    COSMOSDB_KEY: NonEmptyString,
    COSMOSDB_NAME: NonEmptyString,
    COSMOSDB_URI: NonEmptyString,

    MESSAGE_CONTAINER_NAME: NonEmptyString,

    QueueStorageConnection: NonEmptyString,

    isProduction: t.boolean
  }),
  ReqServiceIdConfig,
  CdnConfig
]);

const DEFAULT_CDN_SERVICE_BASE_PATH = "https://assets.cdn.io.italia.it/services" as NonEmptyString;
// No need to re-evaluate this object for each call
const errorOrConfig: t.Validation<IConfig> = IConfig.decode({
  ...process.env,
  CDN_SERVICE_BASE_PATH: pipe(
    process.env.CDN_SERVICE_BASE_PATH,
    O.fromNullable,
    O.getOrElse(() => DEFAULT_CDN_SERVICE_BASE_PATH)
  ),
  ENABLE_CDN_PURGE: pipe(
    process.env.ENABLE_CDN_PURGE,
    O.fromNullable,
    O.map(_ => _.toLowerCase() === "true"),
    O.getOrElse(() => false)
  ),
  isProduction: process.env.NODE_ENV === "production"
});

/**
 * Read the application configuration and check for invalid values.
 * Configuration is eagerly evalued when the application starts.
 *
 * @returns either the configuration values or a list of validation errors
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getConfig(): t.Validation<IConfig> {
  return errorOrConfig;
}

/**
 * Read the application configuration and check for invalid values.
 * If the application is not valid, raises an exception.
 *
 * @returns the configuration values
 * @throws validation errors found while parsing the application configuration
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getConfigOrThrow(): IConfig {
  return pipe(
    errorOrConfig,
    E.getOrElse(errors => {
      throw new Error(`Invalid configuration: ${readableReport(errors)}`);
    })
  );
}

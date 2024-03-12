/* eslint-disable no-invalid-this */
import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import { flow, pipe } from "fp-ts/lib/function";
import { parse } from "fp-ts/lib/Json";

import { NonEmptyString, Ulid } from "@pagopa/ts-commons/lib/strings";
import { RedisClient } from "redis";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  RCConfigurationModel,
  RetrievedRCConfiguration
} from "@pagopa/io-functions-commons/dist/src/models/rc_configuration";
import { getTask, setWithExpirationTask } from "./redis_storage";
import { UlidMapFromString } from "./config";

export const RC_CONFIGURATION_REDIS_PREFIX = "RC-CONFIGURATION";

export default class RCConfigurationUtility {
  constructor(
    private readonly redisClient: RedisClient,
    private readonly rcConfigurationModel: RCConfigurationModel,
    private readonly rcConfigurationCacheTtl: NonNegativeInteger,
    private readonly serviceToRCConfigurationMap: UlidMapFromString
  ) {}

  /**
   * This method retrieves a RC Configuration by it's configuration id, if given,
   * or else it tries to get the configuration id by service id from the related map.
   * If the configuration is cached it retrieves it from cache, or else it retrieves
   * it from cosmosdb and provides to cache it.
   *
   * @param serviceId
   * @param configurationId
   * @returns
   */
  public readonly getOrCacheRCConfigurationWithFallback = (
    serviceId: NonEmptyString,
    configurationId?: Ulid
  ): TE.TaskEither<Error, RetrievedRCConfiguration> =>
    pipe(
      configurationId ?? this.serviceToRCConfigurationMap.get(serviceId),
      Ulid.decode,
      E.fold(
        _ => TE.left(new Error(`ConfigurationId is not valid`)),
        configId =>
          pipe(
            this.getOrCacheMaybeRCConfigurationById(configId),
            TE.chain(
              TE.fromOption(
                () =>
                  new Error(
                    `EMPTY_RC_CONFIGURATION, ConfigurationId=${configId}`
                  )
              )
            )
          )
      )
    );

  /**
   * This method is used to get a configuration, if it exists, by configuratin id.
   * If the configuration is cached it retrieves it from cache, or else it retrieves
   * it from cosmosdb and provides to cache it.
   *
   * @param configurationId
   * @returns
   */
  public readonly getOrCacheMaybeRCConfigurationById = (
    configurationId: Ulid
  ): TE.TaskEither<Error, O.Option<RetrievedRCConfiguration>> =>
    pipe(
      getTask(
        this.redisClient,
        `${RC_CONFIGURATION_REDIS_PREFIX}-${configurationId}`
      ),
      TE.chain(
        TE.fromOption(() => new Error("Cannot Get RCConfiguration from Redis"))
      ),
      TE.chainEitherK(
        flow(
          parse,
          E.mapLeft(
            () => new Error("Cannot parse RCConfiguration Json from Redis")
          ),
          E.chain(
            flow(
              RetrievedRCConfiguration.decode,
              E.mapLeft(
                () => new Error("Cannot decode RCConfiguration Json from Redis")
              )
            )
          )
        )
      ),
      TE.fold(
        () =>
          pipe(
            this.rcConfigurationModel.findLastVersionByModelId([
              configurationId
            ]),
            TE.mapLeft(
              e => new Error(`${e.kind}, RCConfiguration Id=${configurationId}`)
            ),
            TE.chainFirst(maybeRCConfiguration =>
              pipe(
                maybeRCConfiguration,
                TE.fromOption(
                  () =>
                    new Error(
                      `Cannot find any configuration with id: ${configurationId}`
                    )
                ),
                TE.chain(rCConfiguration =>
                  setWithExpirationTask(
                    this.redisClient,
                    `${RC_CONFIGURATION_REDIS_PREFIX}-${configurationId}`,
                    JSON.stringify(rCConfiguration),
                    this.rcConfigurationCacheTtl
                  )
                ),
                TE.orElseW(() => TE.of(maybeRCConfiguration))
              )
            )
          ),
        rCConfiguration => TE.right(O.some(rCConfiguration))
      )
    );
}

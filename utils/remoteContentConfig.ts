/* eslint-disable sonarjs/no-duplicate-string, no-invalid-this, sonarjs/no-identical-functions */
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

const RC_CONFIGURATION_REDIS_PREFIX = "RC-CONFIGURATION";

export default class RCConfigurationUtility {
  constructor(
    private readonly redisClient: RedisClient,
    private readonly rcConfigurationModel: RCConfigurationModel,
    private readonly rcConfigurationCacheTtl: NonNegativeInteger,
    private readonly serviceToRCConfigurationMap: UlidMapFromString
  ) {}

  public readonly getOrCacheRCConfigurationWithFallback = (
    serviceId: NonEmptyString,
    configurationId?: Ulid
  ): TE.TaskEither<Error, RetrievedRCConfiguration> =>
    pipe(
      configurationId ?? this.serviceToRCConfigurationMap[serviceId],
      Ulid.decode,
      E.fold(
        _ => TE.left(new Error(`ConfigurationId is not valid`)),
        configId =>
          pipe(
            getTask(
              this.redisClient,
              `${RC_CONFIGURATION_REDIS_PREFIX}-${configId}`
            ),
            TE.chain(
              TE.fromOption(
                () => new Error("Cannot Get RCConfiguration from Redis")
              )
            ),
            TE.chainEitherK(
              flow(
                parse,
                E.mapLeft(
                  () =>
                    new Error("Cannot parse RCConfiguration Json from Redis")
                ),
                E.chain(
                  flow(
                    RetrievedRCConfiguration.decode,
                    E.mapLeft(
                      () =>
                        new Error(
                          "Cannot decode RCConfiguration Json from Redis"
                        )
                    )
                  )
                )
              )
            ),
            TE.orElse(() =>
              pipe(
                this.rcConfigurationModel.findLastVersionByModelId([configId]),
                TE.mapLeft(
                  e =>
                    new Error(
                      `${e.kind}, RCConfiguration ConfigurationId=${configId}`
                    )
                ),
                TE.chain(
                  TE.fromOption(
                    () =>
                      new Error(
                        `EMPTY_RC_CONFIGURATION, ConfigurationId=${configId}`
                      )
                  )
                ),
                TE.chain(rcConfiguration =>
                  pipe(
                    setWithExpirationTask(
                      this.redisClient,
                      `${RC_CONFIGURATION_REDIS_PREFIX}-${configId}`,
                      JSON.stringify(rcConfiguration),
                      this.rcConfigurationCacheTtl
                    ),
                    TE.map(() => rcConfiguration),
                    TE.orElse(() => TE.of(rcConfiguration))
                  )
                )
              )
            )
          )
      )
    );

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
            TE.chain(rCConfiguration =>
              pipe(
                setWithExpirationTask(
                  this.redisClient,
                  `${RC_CONFIGURATION_REDIS_PREFIX}-${configurationId}`,
                  JSON.stringify(rCConfiguration),
                  this.rcConfigurationCacheTtl
                ),
                TE.map(() => rCConfiguration),
                TE.orElse(() => TE.of(rCConfiguration))
              )
            )
          ),
        rCConfiguration => TE.right(O.some(rCConfiguration))
      )
    );
}

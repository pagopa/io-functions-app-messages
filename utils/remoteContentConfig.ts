import * as TE from "fp-ts/TaskEither";
import * as E from "fp-ts/lib/Either";
import * as O from "fp-ts/lib/Option";
import { flow, pipe } from "fp-ts/lib/function";
import { parse } from "fp-ts/lib/Json";

import { NonEmptyString, Ulid } from "@pagopa/ts-commons/lib/strings";
import { RedisClient } from "redis";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import {
  RemoteContentConfigurationModel,
  RetrievedRemoteContentConfiguration
} from "@pagopa/io-functions-commons/dist/src/models/remote_content_configuration";
import {
  RCConfigurationModel,
  RetrievedRCConfiguration
} from "@pagopa/io-functions-commons/dist/src/models/rc_configuration";
import { getTask, setWithExpirationTask } from "./redis_storage";

export const getOrCacheRemoteServiceConfig = (
  redisClient: RedisClient,
  remoteContentConfigurationModel: RemoteContentConfigurationModel,
  remoteContentConfigCacheTtl: NonNegativeInteger,
  serviceId: NonEmptyString
): TE.TaskEither<Error, RetrievedRemoteContentConfiguration> =>
  pipe(
    getTask(redisClient, `REMOTE-CONTENT-CONFIGURATION-${serviceId}`),
    TE.chain(
      TE.fromOption(
        () =>
          new Error(
            "Cannot Get deprecated Remote Content Configuration from Redis"
          )
      )
    ),
    TE.chainEitherK(
      flow(
        parse,
        E.mapLeft(
          () =>
            new Error(
              "Cannot parse deprecated Remote Content Configuration Json from Redis"
            )
        ),
        E.chain(
          flow(
            RetrievedRemoteContentConfiguration.decode,
            E.mapLeft(
              () =>
                new Error(
                  "Cannot decode deprecated Remote Content Configuration Json from Redis"
                )
            )
          )
        )
      )
    ),
    TE.orElse(() =>
      pipe(
        remoteContentConfigurationModel.find([serviceId, serviceId]),
        TE.mapLeft(
          e =>
            new Error(
              `${e.kind}, Remote Content Configuration ServiceId=${serviceId}`
            )
        ),
        TE.chain(
          TE.fromOption(
            () =>
              new Error(
                `EMPTY_REMOTE_CONTENT_CONFIGURATION, ServiceId=${serviceId}`
              )
          )
        ),
        TE.chain(remoteContentConfiguration =>
          pipe(
            setWithExpirationTask(
              redisClient,
              `REMOTE-CONTENT-CONFIGURATION-${serviceId}`,
              JSON.stringify(remoteContentConfiguration),
              remoteContentConfigCacheTtl
            ),
            TE.map(() => remoteContentConfiguration),
            TE.orElse(() => TE.of(remoteContentConfiguration))
          )
        )
      )
    )
  );

export const getOrCacheMaybeRCConfiguration = (
  redisClient: RedisClient,
  rCConfigurationModel: RCConfigurationModel,
  rCConfigurationCacheTtl: NonNegativeInteger,
  configurationId: Ulid
): TE.TaskEither<Error, O.Option<RetrievedRCConfiguration>> =>
  pipe(
    getTask(redisClient, `REMOTE-CONTENT-CONFIGURATION-${configurationId}`),
    TE.chain(
      TE.fromOption(
        () => new Error("Cannot Get Remote Content Configuration from Redis")
      )
    ),
    TE.chainEitherK(
      flow(
        parse,
        E.mapLeft(
          () =>
            new Error(
              "Cannot parse Remote Content Configuration Json from Redis"
            )
        ),
        E.chain(
          flow(
            RetrievedRCConfiguration.decode,
            E.mapLeft(
              () =>
                new Error(
                  "Cannot decode Remote Content Configuration Json from Redis"
                )
            )
          )
        )
      )
    ),
    TE.fold(
      () =>
        pipe(
          rCConfigurationModel.findLastVersionByModelId([configurationId]),
          TE.mapLeft(
            e =>
              new Error(
                `${e.kind}, Remote Content Configuration Id=${configurationId}`
              )
          ),
          TE.chain(rCConfiguration =>
            pipe(
              setWithExpirationTask(
                redisClient,
                `REMOTE-CONTENT-CONFIGURATION-${configurationId}`,
                JSON.stringify(rCConfiguration),
                rCConfigurationCacheTtl
              ),
              TE.map(() => rCConfiguration),
              TE.orElse(() => TE.of(rCConfiguration))
            )
          )
        ),
      rCConfiguration => TE.right(O.some(rCConfiguration))
    )
  );

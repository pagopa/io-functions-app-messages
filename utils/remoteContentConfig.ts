import * as TE from "fp-ts/TaskEither";
import { flow, pipe } from "fp-ts/lib/function";

import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { RedisClient } from "redis";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { getTask, setWithExpirationTask } from "./redis_storage";

export const getOrCacheRemoteServiceConfig = (
  redisClient: RedisClient,
  remoteContentConfigurationModel: RemoteContentConfigurationModel,
  remoteContentConfigCacheTtl: NonNegativeInteger,
  serviceId: NonEmptyString
): TE.TaskEither<Error, RetrievedRemoteContentConfiguration> =>
  pipe(
    getTask(redisClient, serviceId),
    TE.chain(
      TE.fromOption(
        () => new Error("Cannot Get Remote Content Configuration from Redis")
      )
    ),
    TE.chainEitherK(
      flow(
        parse,
        E.mapLeft(() => new Error("Cannot parse Service Json from Redis")),
        E.chain(
          flow(
            RetrievedRemoteContentConfiguration.decode,
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
    TE.orElse(() =>
      pipe(
        remoteContentConfigurationModel.find([serviceId]),
        TE.mapLeft(e => new Error(`${e.kind}, ServiceId=${serviceId}`)),
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
              serviceId,
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

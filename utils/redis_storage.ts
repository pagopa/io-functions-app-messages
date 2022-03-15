import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as O from "fp-ts/lib/Option";
import * as TE from "fp-ts/lib/TaskEither";
import { RedisClient } from "redis";

/**
 * Parse a Redis given string reply.
 *
 * @see https://redis.io/topics/protocol#simple-string-reply.
 */
const givenStringReply = (
  err: Error | null,
  reply: string | undefined,
  message: string
): E.Either<Error, boolean> => {
  if (err) {
    return E.left<Error, boolean>(err);
  }

  return E.right<Error, boolean>(reply === message);
};

/**
 * Parse a Redis single string reply.
 *
 * @see https://redis.io/topics/protocol#simple-string-reply.
 */
const singleStringReply = (
  err: Error | null,
  reply: "OK" | undefined
): E.Either<Error, boolean> => {
  if (err) {
    return E.left<Error, boolean>(err);
  }

  return E.right<Error, boolean>(reply === "OK");
};

/**
 * Parse a Redis single string reply.
 *
 * @see https://redis.io/topics/protocol#simple-string-reply.
 */
const singleValueReply = (
  err: Error | null,
  reply: string | null
): E.Either<Error, O.Option<string>> => {
  if (err) {
    return E.left<Error, O.Option<string>>(err);
  }
  return E.right<Error, O.Option<string>>(O.fromNullable(reply));
};

/**
 * Parse a Redis integer reply.
 *
 * @see https://redis.io/topics/protocol#integer-reply
 */
const integerReply = (
  err: Error | null,
  reply: unknown,
  expectedReply?: number
): E.Either<Error, boolean> => {
  if (err) {
    return E.left<Error, boolean>(err);
  }
  if (expectedReply !== undefined && expectedReply !== reply) {
    return E.right<Error, boolean>(false);
  }
  return E.right<Error, boolean>(typeof reply === "number");
};

const falsyResponseToError = (
  response: E.Either<Error, boolean>,
  error: Error
): E.Either<Error, true> => {
  if (E.isLeft(response)) {
    return response;
  } else {
    if (response.right) {
      return E.right(true);
    }
    return E.left(error);
  }
};

export const setWithExpirationTask = (
  redisClient: RedisClient,
  key: string,
  value: string,
  expirationInSeconds: number,
  errorMsg?: string
): TE.TaskEither<Error, true> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, true>>(resolve =>
          redisClient.set(
            key,
            value,
            "EX",
            expirationInSeconds,
            (err, response) =>
              resolve(
                falsyResponseToError(
                  singleStringReply(err, response),
                  new Error(
                    errorMsg
                      ? errorMsg
                      : "Error setting key value pair on redis"
                  )
                )
              )
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );

export const setTask = (
  redisClient: RedisClient,
  key: string,
  value: string,
  errorMsg?: string
): TE.TaskEither<Error, true> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, true>>(resolve =>
          // eslint-disable-next-line sonarjs/no-identical-functions
          redisClient.set(key, value, (err, response) =>
            resolve(
              falsyResponseToError(
                singleStringReply(err, response),
                new Error(
                  errorMsg ? errorMsg : "Error setting key value pair on redis"
                )
              )
            )
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );

export const deleteTask = (
  redisClient: RedisClient,
  key: string
): TE.TaskEither<Error, boolean> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, boolean>>(resolve =>
          redisClient.del(key, (err, response) =>
            resolve(
              falsyResponseToError(
                integerReply(err, response),
                new Error("Error deleting key value pair on redis")
              )
            )
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );

export const getTask = (
  redisClient: RedisClient,
  key: string
): TE.TaskEither<Error, O.Option<string>> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, O.Option<string>>>(resolve =>
          redisClient.get(key, (err, response) =>
            resolve(singleValueReply(err, response))
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );

export const pingTask = (
  redisClient: RedisClient
): TE.TaskEither<Error, true> =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<E.Either<Error, true>>(resolve =>
          redisClient.ping("ping message", (err, response) =>
            resolve(
              falsyResponseToError(
                givenStringReply(err, response, "ping message"),
                new Error("Error while pinging redis")
              )
            )
          )
        ),
      E.toError
    ),
    TE.chain(TE.fromEither)
  );

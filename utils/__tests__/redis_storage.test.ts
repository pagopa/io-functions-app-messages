// tslint:disable: no-any
import { pipe } from "fp-ts/lib/function";
import { isNone } from "fp-ts/lib/Option";
import {
  deleteTask,
  getTask,
  setTask,
  setWithExpirationTask
} from "../redis_storage";
import * as TE from "fp-ts/lib/TaskEither";
import * as O from "fp-ts/lib/Option";

const aRedisKey = "KEY";
const aRedisValue = "VALUE";
const aRedisDefaultExpiration = 10;

const setMock = jest
  .fn()
  .mockImplementation((_, __, ___, ____, cb) => cb(undefined, "OK"));
const getMock = jest.fn().mockImplementation((_, cb) => cb(null, aRedisValue));
const delMock = jest.fn().mockImplementation((_, cb) => cb(null, 1));
const redisClientMock = {
  get: getMock,
  set: setMock,
  del: delMock
};

describe("setWithExpirationTask", () => {
  it("should return true if redis store key-value pair correctly", async () => {
    await pipe(
      setWithExpirationTask(
        redisClientMock as any,
        aRedisKey,
        aRedisValue,
        aRedisDefaultExpiration
      ),
      TE.bimap(
        _ => fail(),
        value => expect(value).toEqual(true)
      )
    )();
  });

  it("should return an error if redis store key-value pair returns undefined", async () => {
    setMock.mockImplementationOnce((_, __, ___, ____, cb) =>
      cb(undefined, undefined)
    );
    await pipe(
      setWithExpirationTask(
        redisClientMock as any,
        aRedisKey,
        aRedisValue,
        aRedisDefaultExpiration
      ),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should return an error if redis store key-value pair fails", async () => {
    setMock.mockImplementationOnce((_, __, ___, ____, cb) =>
      cb(new Error("Cannot store key-value pair"), undefined)
    );
    await pipe(
      setWithExpirationTask(
        redisClientMock as any,
        aRedisKey,
        aRedisValue,
        aRedisDefaultExpiration
      ),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});

describe("setTask", () => {
  it("should return true if redis store key-value pair correctly", async () => {
    setMock.mockImplementationOnce((_, __, cb) => cb(undefined, "OK"));
    await pipe(
      setTask(redisClientMock as any, aRedisKey, aRedisValue),
      TE.bimap(
        _ => fail(),
        value => expect(value).toEqual(true)
      )
    )();
  });

  it("should return an error if redis store key-value pair returns undefined", async () => {
    setMock.mockImplementationOnce((_, __, cb) => cb(undefined, undefined));
    await pipe(
      setTask(redisClientMock as any, aRedisKey, aRedisValue),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should return an error if redis store key-value pair fails", async () => {
    setMock.mockImplementationOnce((_, __, cb) =>
      cb(new Error("Cannot store key-value pair"), undefined)
    );
    await pipe(
      setTask(redisClientMock as any, aRedisKey, aRedisValue),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});

describe("getTask", () => {
  it("should return a value if redis get key-value pair correctly", async () => {
    await pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        O.fold(
          () => fail(),
          value => expect(value).toEqual(aRedisValue)
        )
      )
    )();
  });

  it("should return none if no value was found for the provided key", async () => {
    getMock.mockImplementationOnce((_, cb) => cb(undefined, null));
    await pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        maybeResult => expect(isNone(maybeResult)).toBeTruthy()
      )
    )();
  });

  it("should return an error if redis get value fails", async () => {
    getMock.mockImplementationOnce((_, cb) =>
      cb(new Error("Cannot get value"), null)
    );
    await pipe(
      getTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});

describe("deleteTask", () => {
  it("should return true if redis delete key-value pair correctly", async () => {
    await pipe(
      deleteTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        () => fail(),
        value => expect(value).toBeTruthy()
      )
    )();
  });

  it("should return error if no key was found for delete", async () => {
    delMock.mockImplementationOnce((_, cb) => cb(undefined, undefined));
    await pipe(
      deleteTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });

  it("should return an error if redis get value fails", async () => {
    delMock.mockImplementationOnce((_, cb) =>
      cb(new Error("Cannot delete value"), null)
    );
    await pipe(
      deleteTask(redisClientMock as any, aRedisKey),
      TE.bimap(
        _ => expect(_).toBeDefined(),
        () => fail()
      )
    )();
  });
});

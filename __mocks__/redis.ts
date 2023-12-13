import { RedisClient } from "redis";

export const aRedisValue = "VALUE";
export const setMock = jest
  .fn()
  .mockImplementation((_, __, ___, ____, cb) => cb(undefined, "OK"));
export const getMock = jest
  .fn()
  .mockImplementation((_, cb) => cb(null, aRedisValue));
export const delMock = jest.fn().mockImplementation((_, cb) => cb(null, 1));
export const redisClientMock = ({
  get: getMock,
  set: setMock,
  del: delMock
} as unknown) as RedisClient;

import * as E from "fp-ts/lib/Either";

import { IConfig, UlidMapFromString } from "../config";

import { envConfig } from "../../__mocks__/env-config.mock";
import { JsonFromString } from "io-ts-types";
import { Ulid } from "@pagopa/ts-commons/lib/strings";

describe("IConfig - USE_FALLBACK", () => {
  it("should decode USE_FALLBACK with defalt, when is not defined", () => {
    const p = IConfig.encode(envConfig);
    const { USE_FALLBACK, ...env } = p;

    const res = IConfig.decode(env);

    expect(E.isRight(res)).toBe(true);
    if (E.isRight(res)) {
      expect(res.right.USE_FALLBACK).toEqual(false);
    }
  });

  it("should decode USE_FALLBACK with true, when set to 'true'", () => {
    const p = IConfig.encode(envConfig);
    const { USE_FALLBACK, ...env } = p;
    const env2 = { ...env, USE_FALLBACK: "true" };

    const res = IConfig.decode(env2);

    expect(E.isRight(res)).toBe(true);
    if (E.isRight(res)) {
      expect(res.right.USE_FALLBACK).toEqual(true);
    }
  });

  it("should decode SERVICE_TO_RC_CONFIGURATION_MAP with a valid map, when set to a valid json map string", () => {
    const p = IConfig.encode(envConfig);
    const { SERVICE_TO_RC_CONFIGURATION_MAP, ...env } = p;
    const env2 = { ...env, SERVICE_TO_RC_CONFIGURATION_MAP: '{"one": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "two": "01ARZ3NDEKTSV4RRFFQ69G5FAV"}' };
    const map = new Map(Object.entries({one: "01ARZ3NDEKTSV4RRFFQ69G5FAV" as Ulid, two: "01ARZ3NDEKTSV4RRFFQ69G5FAV" as Ulid}));

    const res = IConfig.decode(env2);

    expect(E.isRight(res)).toBe(true);
    if (E.isRight(res)) {
      expect(res.right.SERVICE_TO_RC_CONFIGURATION_MAP).toEqual(map);
    }
  });
});

describe("IConfig - FF_TYPE", () => {
  it("should decode FF_TYPE with defalt, when is not defined", () => {
    const p = IConfig.encode(envConfig);
    const { FF_TYPE, ...env } = p;

    const res = IConfig.decode(env);

    expect(E.isRight(res)).toBe(true);
    if (E.isRight(res)) {
      expect(res.right.FF_TYPE).toEqual("none");
    }
  });

  it("should decode FF_TYPE with right value, when set", () => {
    const p = IConfig.encode(envConfig);
    const { FF_TYPE, ...env } = p;
    const env2 = { ...env, FF_TYPE: "beta" };

    const res = IConfig.decode(env2);

    expect(E.isRight(res)).toBe(true);
    if (E.isRight(res)) {
      expect(res.right.FF_TYPE).toEqual("beta");
    }
  });
});

describe("IConfig - FF_BETA_TESTER_LIST", () => {
  it("should decode FF_BETA_TESTER_LIST with empty array, when not set", () => {
    const p = IConfig.encode(envConfig);
    const { FF_BETA_TESTER_LIST, ...env } = p;

    const res = IConfig.decode(env);

    expect(E.isRight(res)).toBe(true);
    if (E.isRight(res)) {
      expect(res.right.FF_BETA_TESTER_LIST).toEqual([]);
    }
  });

  it("should decode FF_BETA_TESTER_LIST with right value, when set", () => {
    const p = IConfig.encode(envConfig);
    const { FF_TYPE, ...env } = p;
    const env2 = { ...env, FF_BETA_TESTER_LIST: "TEST1,TEST2" };

    const res = IConfig.decode(env2);

    expect(E.isRight(res)).toBe(true);
    if (E.isRight(res)) {
      expect(res.right.FF_BETA_TESTER_LIST).toEqual(["TEST1", "TEST2"]);
    }
  });
});

describe("IConfig - FF_CANARY_USERS_REGEX", () => {
  it("should decode FF_CANARY_USERS_REGEX with XYZ string, when not set", () => {
    const p = IConfig.encode(envConfig);
    const { FF_CANARY_USERS_REGEX, ...env } = p;

    const res = IConfig.decode(env);

    expect(E.isRight(res)).toBe(true);
    if (E.isRight(res)) {
      expect(res.right.FF_CANARY_USERS_REGEX).toEqual("XYZ");
    }
  });

  it("should decode FF_CANARY_USERS_REGEX with right value, when set", () => {
    const p = IConfig.encode(envConfig);
    const { FF_TYPE, ...env } = p;
    const env2 = { ...env, FF_CANARY_USERS_REGEX: "TEST" };

    const res = IConfig.decode(env2);

    expect(E.isRight(res)).toBe(true);
    if (E.isRight(res)) {
      expect(res.right.FF_CANARY_USERS_REGEX).toEqual("TEST");
    }
  });
});

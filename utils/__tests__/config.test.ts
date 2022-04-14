import * as E from "fp-ts/lib/Either";

import { IConfig } from "../config";

import { envConfig } from "../../__mocks__/env-config.mock";

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

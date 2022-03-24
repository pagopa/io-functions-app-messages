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

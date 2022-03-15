import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import nodeFetch from "node-fetch";
import { pipe } from "fp-ts/lib/function";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchApi: typeof fetch = (nodeFetch as any) as typeof fetch;

const ResponseInfo = t.interface({
  body: t.unknown,
  statusCode: NonNegativeInteger
});
export type ResponseInfo = t.TypeOf<typeof ResponseInfo>;

export const fetchJsonFromApi = (
  endpoint: string | Request
): TE.TaskEither<Error, ResponseInfo> =>
  pipe(
    TE.tryCatch(() => fetchApi(endpoint), E.toError),
    TE.chain(response =>
      pipe(
        TE.tryCatch(() => response.json(), E.toError),
        TE.map(body => ({
          body,
          statusCode: response.status as NonNegativeInteger
        }))
      )
    )
  );

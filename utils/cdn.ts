import { CdnManagementClient, PurgeParameters } from "@azure/arm-cdn";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe, constVoid, flow } from "fp-ts/lib/function";
import * as t from "io-ts";
import { fetchJsonFromApi } from "./fetch";
import { errorsToError } from "./conversions";

export const purgeCdnEndpointPaths = (
  cdnClient: CdnManagementClient,
  cdnResourceGroupName: NonEmptyString,
  cdnProfileName: NonEmptyString,
  cdnEndpointName: NonEmptyString
) => (contentFilePaths: PurgeParameters): TE.TaskEither<Error, void> =>
  pipe(
    TE.tryCatch(
      () =>
        cdnClient.endpoints.beginPurgeContent(
          cdnResourceGroupName,
          cdnProfileName,
          cdnEndpointName,
          contentFilePaths
        ),
      E.toError
    ),
    TE.map(constVoid)
  );

export const dummyCdnPurger = (
  contentFilePaths: PurgeParameters
): TE.TaskEither<Error, void> =>
  pipe(TE.of(contentFilePaths), TE.map(constVoid));

export const getContentFromCdn = <S, A>(
  url: string,
  type: t.Type<A, S, unknown>
): TE.TaskEither<Error, A> =>
  pipe(
    fetchJsonFromApi(url),
    TE.chain(
      TE.fromPredicate(
        response => response.statusCode === 200,
        res =>
          new Error(
            `Error while retrieving content from CDN endpoint=${url}, statusCode=${res.statusCode}`
          )
      )
    ),
    TE.map(r => r.body),
    TE.chainEitherKW(flow(type.decode, E.mapLeft(errorsToError)))
  );

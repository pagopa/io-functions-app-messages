import { Context } from "@azure/functions";

import * as TE from "fp-ts/TaskEither";

import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";

import { FeatureFlatType } from "../../utils/config";
import { getMessagesFromFallback } from "./getMessages.fallback";
import { EnrichedMessageWithContent } from "./models";

// --------------------------------
// GetMessages Functions Interface
// --------------------------------

interface IGetMessagesParams {
  readonly context: Context;
  readonly fiscalCode: FiscalCode;
  readonly pageSize: NonNegativeInteger;
  readonly shouldEnrichResultData: boolean;
  readonly shouldGetArchivedMessages: boolean;
  readonly maximumId: NonEmptyString;
  readonly minimumId: NonEmptyString;
}

export interface IPageResult<T> {
  readonly items: ReadonlyArray<T>;
  readonly next?: string;
  readonly prev?: string;
}

export type IGetMessagesFunction = ({
  context,
  fiscalCode,
  pageSize,
  shouldEnrichResultData,
  shouldGetArchivedMessages,
  maximumId,
  minimumId
}: IGetMessagesParams) => TE.TaskEither<
  CosmosErrors | Error,
  IPageResult<EnrichedMessageWithContent>
>;

// --------------------------------
// GetMessages Selector
// --------------------------------

export interface ISelectionParameters {
  readonly fiscalCode: string;
}

export interface IGetMessagesFunctionSelector {
  readonly select: (params: ISelectionParameters) => IGetMessagesFunction;
}

export const createGetMessagesFunctionSelection = (
  switchToFallback: boolean,
  featureFlagType: FeatureFlatType,
  fallbackSetup: Parameters<typeof getMessagesFromFallback>
): IGetMessagesFunctionSelector => ({
  select: (_params: ISelectionParameters): IGetMessagesFunction => {
    if (switchToFallback) {
      return getMessagesFromFallback(...fallbackSetup);
    } else {
      // TODO
      // check fiscal code from beta tester, if "beta"
      // check fiscal code pattern, if "canary"
      // always return new function, if "prod"
      switch (featureFlagType) {
        case "none":
        case "beta":
        case "canary":
        case "prod":
        default:
          return getMessagesFromFallback(...fallbackSetup);
      }
    }
  }
});

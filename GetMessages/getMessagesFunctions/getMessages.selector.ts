import { Context } from "@azure/functions";

import * as TE from "fp-ts/TaskEither";

import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";

import { FeatureFlagType } from "../../utils/config";
import { toFiscalCodeHash } from "../../utils/fiscalCodeHash";

import { getMessagesFromFallback } from "./getMessages.fallback";
import { EnrichedMessageWithContent } from "./models";
import { getMessagesFromView } from "./getMessages.view";

// --------------------------------
// GetMessages Functions Interface
// --------------------------------

interface IGetMessagesParams {
  readonly context: Context;
  readonly fiscalCode: FiscalCode;
  readonly pageSize: NonNegativeInteger;
  readonly shouldEnrichResultData: boolean;
  readonly shouldGetArchivedMessages: boolean;
  readonly maximumId?: NonEmptyString;
  readonly minimumId?: NonEmptyString;
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
  readonly fiscalCode: FiscalCode;
}

export interface IGetMessagesFunctionSelector {
  readonly select: (params: ISelectionParameters) => IGetMessagesFunction;
}

export const createGetMessagesFunctionSelection = (
  switchToFallback: boolean,
  featureFlagType: FeatureFlagType,
  betaTesterUsers: ReadonlyArray<NonEmptyString>,
  canaryTestUserRegex: NonEmptyString,
  fallbackSetup: Parameters<typeof getMessagesFromFallback>,
  viewSetup: Parameters<typeof getMessagesFromView>
  // eslint-disable-next-line max-params
): IGetMessagesFunctionSelector => ({
  select: (params: ISelectionParameters): IGetMessagesFunction => {
    if (switchToFallback) {
      return getMessagesFromFallback(...fallbackSetup);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      const isCanaryTestUser = getIsUserACanaryTestUser(canaryTestUserRegex);

      switch (featureFlagType) {
        case "none":
          return getMessagesFromFallback(...fallbackSetup);
        case "beta":
          return betaTesterUsers.includes(toFiscalCodeHash(params.fiscalCode))
            ? getMessagesFromView(...viewSetup)
            : getMessagesFromFallback(...fallbackSetup);
        case "canary":
          return isCanaryTestUser(toFiscalCodeHash(params.fiscalCode)) ||
            betaTesterUsers.includes(toFiscalCodeHash(params.fiscalCode))
            ? getMessagesFromView(...viewSetup)
            : getMessagesFromFallback(...fallbackSetup);
        case "prod":
          return getMessagesFromView(...viewSetup);
        default:
          return getMessagesFromFallback(...fallbackSetup);
      }
    }
  }
});

/**
 *
 * @param regex The regex to use
 * @returns
 */
export const getIsUserACanaryTestUser = (
  regex: string
): ((sha: NonEmptyString) => boolean) => {
  const regExp = new RegExp(regex);

  return (sha: NonEmptyString): boolean => regExp.test(sha);
};

import { CosmosClient, Database } from "@azure/cosmos";

import * as TE from "fp-ts/lib/TaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as O from "fp-ts/Option";
import { pipe } from "fp-ts/lib/function";

import * as MessageCollection from "@pagopa/io-functions-commons/dist/src/models/message";
import * as MessageViewCollection from "@pagopa/io-functions-commons/dist/src/models/message_view";
import * as MessageStatusCollection from "@pagopa/io-functions-commons/dist/src/models/message_status";
import * as ServiceModel from "@pagopa/io-functions-commons/dist/src/models/service";

import { log } from "../utils/logger";
import {
  createContainer as createCollection,
  createDatabase,
  deleteContainer
} from "./utils/cosmos";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { CosmosErrors } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { toCosmosErrorResponse } from "@pagopa/io-functions-commons/dist/src/utils/cosmosdb_model";
import { Container } from "@azure/cosmos";
import { BlobService } from "azure-storage";
import { MESSAGE_CONTAINER_NAME } from "../env";
import { flow } from "fp-ts/lib/function";
import { toError } from "fp-ts/lib/Either";
import { getOrElseW } from "fp-ts/lib/Either";

/**
 * Create "messages" collection, with indexing policy
 *
 * @param db
 * @returns
 */
const createMessageCollection = (
  db: Database
): TE.TaskEither<CosmosErrors, Container> =>
  pipe(
    createCollection(
      db,
      MessageCollection.MESSAGE_COLLECTION_NAME,
      MessageCollection.MESSAGE_MODEL_PK_FIELD,
      {
        indexingMode: "consistent",
        automatic: true,
        includedPaths: [
          {
            path: "/*"
          }
        ],
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ],
        compositeIndexes: [
          [
            {
              path: "/fiscalCode",
              order: "ascending"
            },
            {
              path: "/id",
              order: "descending"
            }
          ]
        ]
      } as any
    )
  );

/**
 * Create "messages" collection, with indexing policy
 *
 * @param db
 * @returns
 */
const createMessageViewCollection = (
  db: Database
): TE.TaskEither<CosmosErrors, Container> =>
  pipe(
    createCollection(
      db,
      MessageViewCollection.MESSAGE_VIEW_COLLECTION_NAME,
      "fiscalCode",
      {
        indexingMode: "consistent",
        automatic: true,
        includedPaths: [
          {
            path: "/*"
          }
        ],
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ],
        compositeIndexes: [
          [
            {
              path: "/fiscalCode",
              order: "ascending"
            },
            {
              path: "/id",
              order: "descending"
            }
          ],
          [
            {
              path: "/fiscalCode",
              order: "ascending"
            },
            {
              path: "/id",
              order: "descending"
            },
            {
              path: "/status/archived",
              order: "ascending"
            }
          ]
        ]
      } as any
    )
  );

/**
 *
 * @param database
 * @returns
 */
export const createAllCollections = (
  database: Database
): TE.TaskEither<CosmosErrors, readonly Container[]> =>
  pipe(
    [
      // messages
      createMessageCollection(database),
      // messages-view
      createMessageViewCollection(database),
      // services
      createCollection(
        database,
        ServiceModel.SERVICE_COLLECTION_NAME,
        ServiceModel.SERVICE_MODEL_PK_FIELD
      ),
      // message-status
      createCollection(
        database,
        MessageStatusCollection.MESSAGE_STATUS_COLLECTION_NAME,
        MessageStatusCollection.MESSAGE_STATUS_MODEL_PK_FIELD
      )
    ],
    RA.sequence(TE.ApplicativePar)
  );

/**
 * Create DB
 */
export const deleteAllCollections = (
  database: Database
): TE.TaskEither<CosmosErrors, readonly Container[]> => {
  log("deleting CosmosDB");

  return pipe(
    database,
    TE.of,
    TE.bindTo("db"),
    TE.bind("collectionNames", ({ db }) =>
      pipe(
        TE.tryCatch(
          () => db.containers.readAll().fetchAll(),
          toCosmosErrorResponse
        ),
        TE.map(r => r.resources),
        TE.map(RA.map(r => r.id))
      )
    ),
    TE.chain(({ db, collectionNames }) =>
      pipe(
        collectionNames,
        RA.map(r => deleteContainer(db, r)),
        RA.sequence(TE.ApplicativePar)
      )
    ),
    TE.map(collections => {
      log("Deleted", collections.length, "collections");
      return collections;
    }),
    TE.mapLeft(err => {
      log("Error", err);
      return err;
    })
  );
};

/**
 * Create DB and collections
 */
export const createCosmosDbAndCollections = (
  client: CosmosClient,
  cosmosDbName: string
): TE.TaskEither<CosmosErrors, Database> =>
  pipe(
    createDatabase(client, cosmosDbName),
    // Delete all collections, in case they already exist
    TE.chainFirst(deleteAllCollections),
    TE.chainFirst(createAllCollections),
    TE.mapLeft(err => {
      log("Error", err);
      return err;
    })
  );

// ------------------
// Fil data
// ------------------

/**
 * Create DB
 */
export const fillMessages = async (
  db: Database,
  blobService: BlobService,
  messages: ReadonlyArray<MessageCollection.NewMessageWithContent>
): Promise<void> => {
  await pipe(
    db.container(MessageCollection.MESSAGE_COLLECTION_NAME),
    TE.of,
    TE.map(
      c =>
        new MessageCollection.MessageModel(
          c,
          MESSAGE_CONTAINER_NAME as NonEmptyString
        )
    ),
    TE.chainFirst(model =>
      pipe(
        messages,
        RA.map(m => model.create(m)),
        RA.sequence(TE.ApplicativePar)
      )
    ),
    TE.chainW(model =>
      pipe(
        messages,
        RA.filter(m => m.isPending === false),
        RA.map(m => model.storeContentAsBlob(blobService, m.id, m.content)),
        RA.sequence(TE.ApplicativePar)
      )
    ),
    TE.map(_ => log(`${_.length} Messages created`)),
    TE.mapLeft(_ => {
      log("Error", _);
    })
  )();
};

/**
 * Create DB
 */
export const fillMessagesView = async (
  db: Database,
  messages: ReadonlyArray<MessageCollection.NewMessageWithContent>,
  messageStatuses: ReadonlyArray<MessageStatusCollection.NewMessageStatus>
): Promise<void> => {
  await pipe(
    db.container(MessageViewCollection.MESSAGE_VIEW_COLLECTION_NAME),
    TE.of,
    TE.map(c => new MessageViewCollection.MessageViewModel(c)),
    TE.chain(model =>
      pipe(
        messages,
        RA.map(m => ({
          ...m,
          components: {
            attachments: {
              has: false
            },
            euCovidCert: {
              has: m.content.eu_covid_cert != null
            },
            legalData: {
              has: m.content.legal_data != null
            },
            payment: {
              has: m.content.payment_data != null,
              notice_number: m.content.payment_data?.notice_number
            }
          },
          messageTitle: m.content.subject,
          status: {
            archived: messageStatuses.find(ms => ms.messageId === m.id)
              ?.isArchived,
            processing: messageStatuses.find(ms => ms.messageId === m.id)
              ?.status,
            read: messageStatuses.find(ms => ms.messageId === m.id)?.isRead
          },
          version: 0
        })),
        RA.map(MessageViewCollection.MessageView.decode),
        RA.map(
          getOrElseW(_ => {
            throw _;
          })
        ),
        RA.map(m => model.create(m)),
        RA.sequence(TE.ApplicativePar)
      )
    ),
    TE.map(_ => log(`${_.length} MessagesView created`)),
    TE.mapLeft(_ => {
      log("Error", _);
    })
  )();
};

export const fillServices = async (
  db: Database,
  services: ReadonlyArray<ServiceModel.NewService>
): Promise<void> => {
  await pipe(
    db.container(ServiceModel.SERVICE_COLLECTION_NAME),
    TE.of,
    TE.map(c => new ServiceModel.ServiceModel(c)),
    TE.chain(model =>
      pipe(
        services,
        RA.map(m => model.create(m)),
        RA.sequence(TE.ApplicativePar)
      )
    ),
    TE.map(_ => log(`${_.length} Services created`)),
    TE.mapLeft(_ => {
      log("Error", _);
    })
  )();
};

export const fillMessagesStatus = async (
  db: Database,
  messageStatuses: ReadonlyArray<MessageStatusCollection.NewMessageStatus>
) =>
  pipe(
    db.container(MessageStatusCollection.MESSAGE_STATUS_COLLECTION_NAME),
    TE.of,
    TE.map(c => new MessageStatusCollection.MessageStatusModel(c)),
    TE.chain(messageStatusModel =>
      pipe(
        messageStatuses,
        RA.mapWithIndex((i, m) =>
          i === 0 ? messageStatusModel.create(m) : messageStatusModel.upsert(m)
        ),
        RA.sequence(TE.ApplicativeSeq)
      )
    )
  )();

export const setMessagesAsArchived = async (
  db: Database,
  messageIds: ReadonlyArray<NonEmptyString>
) =>
  pipe(
    db.container(MessageStatusCollection.MESSAGE_STATUS_COLLECTION_NAME),
    TE.of,
    TE.map(c => new MessageStatusCollection.MessageStatusModel(c)),
    TE.chain(messageStatusModel =>
      pipe(
        messageIds,
        RA.map(m => messageStatusModel.findLastVersionByModelId([m])),
        RA.sequence(TE.ApplicativeSeq),
        TE.chainW(
          flow(
            RA.map(ms =>
              O.isSome(ms)
                ? pipe(
                    messageStatusModel.upsert({
                      ...ms.value,
                      kind: "INewMessageStatus",
                      isArchived: true
                    }),
                    TE.mapLeft(toError)
                  )
                : TE.left(Error("Cannot find message status"))
            ),
            RA.sequence(TE.ApplicativeSeq)
          )
        )
      )
    )
  )();

export const setMessagesViewAsArchived = async (
  db: Database,
  fiscalCode: FiscalCode,
  messageIds: ReadonlyArray<NonEmptyString>
) =>
  pipe(
    db.container(MessageViewCollection.MESSAGE_VIEW_COLLECTION_NAME),
    TE.of,
    TE.map(c => new MessageViewCollection.MessageViewModel(c)),
    TE.chain(model =>
      pipe(
        messageIds,
        RA.map(id =>
          pipe(
            model.find([id, fiscalCode]),
            TE.filterOrElseW(O.isSome, () => Error(`cannot find id ${id}`)),
            TE.chainW(m =>
              model.upsert({
                ...m.value,
                status: { ...m.value.status, archived: true }
              })
            )
          )
        ),
        RA.sequence(TE.ApplicativeSeq)
      )
    ),
    TE.mapLeft(_ => console.log("Error patching", _))
  )();

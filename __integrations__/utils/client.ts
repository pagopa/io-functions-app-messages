import { MessageStatusChange } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageStatusChange";

/**
 * Get Messages
 */
export const getMessages = (nodeFetch: typeof fetch, baseUrl: string) => async (
  fiscalCode?: string
): Promise<Response> => nodeFetch(`${baseUrl}/api/v1/messages/${fiscalCode}`);
/**
 * Get Messages
 */
export const getMessagesWithEnrichment = (
  nodeFetch: typeof fetch,
  baseUrl: string
) => async (
  fiscalCode?: string,
  page_size?: number,
  maximum_id?: number,
  archived?: boolean
): Promise<Response> =>
  nodeFetch(
    `${baseUrl}/api/v1/messages/${fiscalCode}?enrich_result_data=true&page_size=${page_size}&maximum_id=${maximum_id}${
      archived ? `&archived=${archived}` : ``
    }`
  );

// --------------
// Upsert Message Status
// --------------

export const upsertMessageStatus = (
  nodeFetch: typeof fetch,
  baseUrl: string
) => async (
  fiscalCode: string,
  messageId: string,
  body: MessageStatusChange
): Promise<Response> =>
  nodeFetch(`${baseUrl}/messages/${fiscalCode}/${messageId}/message-status`, {
    body: JSON.stringify(body),
    method: "put"
  });

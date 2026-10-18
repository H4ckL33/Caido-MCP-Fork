const AUTOMATE_SESSION_FIELDS = `
  fragment AgentSafeAutomateSessionFields on AutomateSession {
    id name createdAt raw
    connection { host port isTLS SNI }
    settings {
      closeConnection updateContentLength strategy
      concurrency { delay workers }
      retryOnFailure { backoff maximumRetries }
      placeholders { start end }
      redirect { max strategy }
      payloads {
        options {
          ... on AutomateSimpleListPayload { list }
          ... on AutomateHostedFilePayload { id delimiter }
          ... on AutomateNullPayload { quantity }
          ... on AutomateNumberPayload { range { start end } increments minLength }
        }
        preprocessors { options { __typename } }
      }
    }
  }
`;

export const GET_AUTOMATE_SESSION_QUERY = `
  query AgentSafeAutomateSession($id: ID!) {
    automateSession(id: $id) { ...AgentSafeAutomateSessionFields }
  }
  ${AUTOMATE_SESSION_FIELDS}
`;

export const CREATE_AUTOMATE_SESSION_MUTATION = `
  mutation AgentSafeCreateAutomateSession($input: CreateAutomateSessionInput!) {
    createAutomateSession(input: $input) { session { ...AgentSafeAutomateSessionFields } }
  }
  ${AUTOMATE_SESSION_FIELDS}
`;

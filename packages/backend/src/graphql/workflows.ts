const WORKFLOW_FIELDS = `
  fragment AgentSafeWorkflowFields on Workflow {
    id
    name
    kind
    definition
    enabled
    global
    readOnly
    createdAt
    updatedAt
  }
`;

export const LIST_WORKFLOWS_QUERY = `
  query AgentSafeWorkflows { workflows { ...AgentSafeWorkflowFields } }
  ${WORKFLOW_FIELDS}
`;

export const GET_WORKFLOW_QUERY = `
  query AgentSafeWorkflow($id: ID!) { workflow(id: $id) { ...AgentSafeWorkflowFields } }
  ${WORKFLOW_FIELDS}
`;

export const CREATE_WORKFLOW_MUTATION = `
  mutation AgentSafeCreateWorkflow($input: CreateWorkflowInput!) {
    createWorkflow(input: $input) {
      workflow { ...AgentSafeWorkflowFields }
      error { __typename code }
    }
  }
  ${WORKFLOW_FIELDS}
`;

export const UPDATE_WORKFLOW_MUTATION = `
  mutation AgentSafeUpdateWorkflow($id: ID!, $input: UpdateWorkflowInput!) {
    updateWorkflow(id: $id, input: $input) {
      workflow { ...AgentSafeWorkflowFields }
      error { __typename code }
    }
  }
  ${WORKFLOW_FIELDS}
`;

export const TOGGLE_WORKFLOW_MUTATION = `
  mutation AgentSafeToggleWorkflow($id: ID!, $enabled: Boolean!) {
    toggleWorkflow(id: $id, enabled: $enabled) {
      workflow { ...AgentSafeWorkflowFields }
      error { __typename code }
    }
  }
  ${WORKFLOW_FIELDS}
`;

export const DELETE_WORKFLOW_MUTATION = `
  mutation AgentSafeDeleteWorkflow($id: ID!) {
    deleteWorkflow(id: $id) { deletedId error { __typename code } }
  }
`;

export const RUN_CONVERT_WORKFLOW_MUTATION = `
  mutation AgentSafeRunConvertWorkflow($id: ID!, $input: Blob!) {
    runConvertWorkflow(id: $id, input: $input) {
      output
      error { __typename code }
    }
  }
`;

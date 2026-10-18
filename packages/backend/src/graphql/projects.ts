const PROJECT_FIELDS = `
  fragment AgentSafeProjectFields on Project {
    id
    name
    path
    status
    temporary
    createdAt
    updatedAt
    version
    size
    readOnly
  }
`;

export const LIST_PROJECTS_QUERY = `
  query AgentSafeProjects {
    projects { ...AgentSafeProjectFields }
  }
  ${PROJECT_FIELDS}
`;

export const CREATE_PROJECT_MUTATION = `
  mutation AgentSafeCreateProject($input: CreateProjectInput!) {
    createProject(input: $input) {
      project { ...AgentSafeProjectFields }
      error { __typename code }
    }
  }
  ${PROJECT_FIELDS}
`;

export const RENAME_PROJECT_MUTATION = `
  mutation AgentSafeRenameProject($id: ID!, $name: String!) {
    renameProject(id: $id, name: $name) {
      project { ...AgentSafeProjectFields }
      error { __typename code }
    }
  }
  ${PROJECT_FIELDS}
`;

export const SELECT_PROJECT_MUTATION = `
  mutation AgentSafeSelectProject($id: ID!) {
    selectProject(id: $id) {
      currentProject { project { ...AgentSafeProjectFields } }
      error { __typename code }
    }
  }
  ${PROJECT_FIELDS}
`;

export const DELETE_PROJECT_MUTATION = `
  mutation AgentSafeDeleteProject($id: ID!) {
    deleteProject(id: $id) {
      deletedId
      error { __typename code }
    }
  }
`;

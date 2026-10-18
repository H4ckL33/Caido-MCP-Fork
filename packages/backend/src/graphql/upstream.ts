const UPSTREAM_HTTP_FIELDS = `
  fragment AgentSafeUpstreamHttpFields on UpstreamProxyHttp {
    id enabled rank allowlist denylist
    connection { host port isTLS SNI }
    auth { __typename }
  }
`;

const UPSTREAM_SOCKS_FIELDS = `
  fragment AgentSafeUpstreamSocksFields on UpstreamProxySocks {
    id enabled rank allowlist denylist includeDns
    connection { host port isTLS SNI }
    auth { __typename }
  }
`;

export const LIST_UPSTREAM_PROXIES_QUERY = `
  query AgentSafeUpstreamProxies {
    upstreamProxiesHttp { ...AgentSafeUpstreamHttpFields }
    upstreamProxiesSocks { ...AgentSafeUpstreamSocksFields }
  }
  ${UPSTREAM_HTTP_FIELDS}
  ${UPSTREAM_SOCKS_FIELDS}
`;

export const CREATE_UPSTREAM_HTTP_MUTATION = `
  mutation AgentSafeCreateUpstreamHttp($input: CreateUpstreamProxyHttpInput!) {
    createUpstreamProxyHttp(input: $input) { proxy { ...AgentSafeUpstreamHttpFields } }
  }
  ${UPSTREAM_HTTP_FIELDS}
`;

export const CREATE_UPSTREAM_SOCKS_MUTATION = `
  mutation AgentSafeCreateUpstreamSocks($input: CreateUpstreamProxySocksInput!) {
    createUpstreamProxySocks(input: $input) { proxy { ...AgentSafeUpstreamSocksFields } }
  }
  ${UPSTREAM_SOCKS_FIELDS}
`;

export const UPDATE_UPSTREAM_HTTP_MUTATION = `
  mutation AgentSafeUpdateUpstreamHttp($id: ID!, $input: UpdateUpstreamProxyHttpInput!) {
    updateUpstreamProxyHttp(id: $id, input: $input) { proxy { ...AgentSafeUpstreamHttpFields } }
  }
  ${UPSTREAM_HTTP_FIELDS}
`;

export const UPDATE_UPSTREAM_SOCKS_MUTATION = `
  mutation AgentSafeUpdateUpstreamSocks($id: ID!, $input: UpdateUpstreamProxySocksInput!) {
    updateUpstreamProxySocks(id: $id, input: $input) { proxy { ...AgentSafeUpstreamSocksFields } }
  }
  ${UPSTREAM_SOCKS_FIELDS}
`;

export const TOGGLE_UPSTREAM_HTTP_MUTATION = `
  mutation AgentSafeToggleUpstreamHttp($id: ID!, $enabled: Boolean!) {
    toggleUpstreamProxyHttp(id: $id, enabled: $enabled) { proxy { ...AgentSafeUpstreamHttpFields } }
  }
  ${UPSTREAM_HTTP_FIELDS}
`;

export const TOGGLE_UPSTREAM_SOCKS_MUTATION = `
  mutation AgentSafeToggleUpstreamSocks($id: ID!, $enabled: Boolean!) {
    toggleUpstreamProxySocks(id: $id, enabled: $enabled) { proxy { ...AgentSafeUpstreamSocksFields } }
  }
  ${UPSTREAM_SOCKS_FIELDS}
`;

export const DELETE_UPSTREAM_HTTP_MUTATION = `
  mutation AgentSafeDeleteUpstreamHttp($id: ID!) {
    deleteUpstreamProxyHttp(id: $id) { deletedId }
  }
`;

export const DELETE_UPSTREAM_SOCKS_MUTATION = `
  mutation AgentSafeDeleteUpstreamSocks($id: ID!) {
    deleteUpstreamProxySocks(id: $id) { deletedId }
  }
`;

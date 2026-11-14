metadata name = 'Earwyrm MCP gateway route'
metadata description = 'Native Streamable HTTP MCP passthrough with seller and backend identity checks.'

@description('Existing API Management resource name.')
param gatewayName string
@description('MCP server route name.')
param name string
@description('Authenticated MCP backend base URL.')
param backendUrl string
@description('Seller API application ID.')
param sellerApiClientId string
@description('Backend application ID used by APIM managed identity.')
param backendApiClientId string

resource gateway 'Microsoft.ApiManagement/service@2024-05-01' existing = {
  name: gatewayName
}

// Native MCP management is only available in the documented preview API.
resource api 'Microsoft.ApiManagement/service/apis@2025-09-01-preview' = {
  parent: gateway
  name: name
  properties: {
    type: 'mcp'
    displayName: 'Earwyrm ${name}'
    path: name
    protocols: ['https']
    subscriptionRequired: false
    serviceUrl: backendUrl
    mcpProperties: {
      transportType: 'streamable'
      endpoints: [
        { name: 'message', uriTemplate: '/mcp' }
      ]
    }
  }
}

var policy = replace(
  replace(
    replace(loadTextContent('./mcp-policy.xml'), '__TENANT_ID__', tenant().tenantId),
    '__SELLER_API_CLIENT_ID__',
    sellerApiClientId
  ),
  '__BACKEND_API_CLIENT_ID__',
  backendApiClientId
)

resource apiPolicy 'Microsoft.ApiManagement/service/apis/policies@2025-09-01-preview' = {
  parent: api
  name: 'policy'
  properties: {
    format: 'rawxml'
    value: policy
  }
}

@description('Seller-facing Streamable HTTP MCP endpoint.')
output endpoint string = '${gateway.properties.gatewayUrl}/${name}/mcp'

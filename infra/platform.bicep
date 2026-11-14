metadata name = 'Earwyrm Azure platform'
metadata description = 'Identity-first foundation; service integration remains explicit follow-on work.'

@description('azd environment name.')
param environmentName string
@description('Primary compute, storage and monitoring region.')
param location string
@description('Seller application ID.')
param sellerApiClientId string
@description('Backend application ID.')
param backendApiClientId string
@description('Deployment principal object ID.')
param principalId string
@description('APIM publisher contact email.')
param publisherEmail string
@description('Azure OpenAI region.')
param modelLocation string
@description('Azure OpenAI model name.')
param modelName string
@description('Exact Azure OpenAI model version.')
param modelVersion string
@description('Model deployment SKU.')
param modelSku string
@description('Model capacity units.')
param modelCapacity int
@description('Content Safety region.')
param safetyLocation string
@description('Paid Speech region.')
param speechLocation string
@description('MCP-supported APIM tier.')
param apimSku string
@description('Bootstrap image listening on port 8080.')
param bootstrapImage string

var suffix = uniqueString(subscription().id, resourceGroup().id)
var tags = { 'azd-env-name': environmentName }
var roles = ['web', 'lyric', 'melody', 'render']
var blobContributor = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)
var queueContributor = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
)
var cognitiveUser = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'a97b65f3-24c7-4388-baec-2e87135dc908'
)

resource registry 'Microsoft.ContainerRegistry/registries@2025-11-01' = {
  name: 'crewyrm${suffix}'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}

resource pullIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: 'id-pull-${suffix}'
  location: location
  tags: tags
}

resource identities 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = [
  for role in roles: {
    name: 'id-${role}-${suffix}'
    location: location
    tags: tags
  }
]

resource pullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, pullIdentity.id, 'pull')
  properties: {
    principalId: pullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'
    )
  }
}

resource pushRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, principalId, 'push')
  properties: {
    principalId: principalId
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '8311e382-0749-4cb8-b61a-304f252e45ec'
    )
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: 'log-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${suffix}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    DisableLocalAuth: true
  }
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2026-07-01' = {
  name: 'cae-${suffix}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: { destination: 'azure-monitor' }
    workloadProfiles: [
      { name: 'Consumption', workloadProfileType: 'Consumption' }
    ]
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'container-logs'
  scope: containerEnvironment
  properties: {
    workspaceId: logs.id
    logs: [
      { categoryGroup: 'allLogs', enabled: true }
    ]
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2025-06-01' = {
  name: 'stewyrm${suffix}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
  }
}

resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2025-06-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 7 }
  }
}
resource artifacts 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-06-01' = {
  parent: blobs
  name: 'artifacts'
  properties: { publicAccess: 'None' }
}
resource briefs 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-06-01' = {
  parent: blobs
  name: 'briefs'
  properties: { publicAccess: 'None' }
}
resource approvals 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-06-01' = {
  parent: blobs
  name: 'approvals'
  properties: { publicAccess: 'None' }
}
resource queues 'Microsoft.Storage/storageAccounts/queueServices@2025-06-01' = {
  parent: storage
  name: 'default'
}
resource queue 'Microsoft.Storage/storageAccounts/queueServices/queues@2025-06-01' = {
  parent: queues
  name: 'render'
}

resource artifactRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for index in [0, 2, 3]: {
    scope: artifacts
    name: guid(artifacts.id, identities[index].id)
    properties: {
      principalId: identities[index].properties.principalId
      principalType: 'ServicePrincipal'
      roleDefinitionId: index == 0
        ? subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1')
        : blobContributor
    }
  }
]
resource briefRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: briefs
  name: guid(briefs.id, identities[0].id)
  properties: {
    principalId: identities[0].properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobContributor
  }
}
resource approvalRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: approvals
  name: guid(approvals.id, identities[0].id)
  properties: {
    principalId: identities[0].properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: blobContributor
  }
}
resource queueRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for index in [2, 3]: {
    scope: queue
    name: guid(queue.id, identities[index].id)
    properties: {
      principalId: identities[index].properties.principalId
      principalType: 'ServicePrincipal'
      roleDefinitionId: queueContributor
    }
  }
]

resource foundry 'Microsoft.CognitiveServices/accounts@2025-09-01' = {
  name: 'aoai-${suffix}'
  location: modelLocation
  tags: tags
  kind: 'OpenAI'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'aoai-${suffix}'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}
resource model 'Microsoft.CognitiveServices/accounts/deployments@2025-09-01' = {
  parent: foundry
  name: 'lyrics'
  sku: { name: modelSku, capacity: modelCapacity }
  properties: {
    model: { format: 'OpenAI', name: modelName, version: modelVersion }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
}
resource modelRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: foundry
  name: guid(foundry.id, identities[1].id)
  properties: {
    principalId: identities[1].properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
    )
  }
}

resource safety 'Microsoft.CognitiveServices/accounts@2025-09-01' = {
  name: 'safety-${suffix}'
  location: safetyLocation
  tags: tags
  kind: 'ContentSafety'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'safety-${suffix}'
    disableLocalAuth: true
  }
}
resource safetyRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: safety
  name: guid(safety.id, identities[1].id)
  properties: {
    principalId: identities[1].properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveUser
  }
}
resource speech 'Microsoft.CognitiveServices/accounts@2025-09-01' = {
  name: 'speech-${suffix}'
  location: speechLocation
  tags: tags
  kind: 'SpeechServices'
  sku: { name: 'S0' }
  properties: {
    customSubDomainName: 'speech-${suffix}'
    disableLocalAuth: true
  }
}
resource speechRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: speech
  name: guid(speech.id, identities[3].id)
  properties: {
    principalId: identities[3].properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveUser
  }
}

resource vault 'Microsoft.KeyVault/vaults@2025-05-01' = {
  name: 'kv-${suffix}'
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    enablePurgeProtection: true
    accessPolicies: []
  }
}

resource gateway 'Microsoft.ApiManagement/service@2024-05-01' = {
  name: 'apim-${suffix}'
  location: location
  tags: tags
  sku: { name: apimSku, capacity: 1 }
  identity: { type: 'SystemAssigned' }
  properties: {
    publisherName: 'Earwyrm'
    publisherEmail: publisherEmail
  }
}

module services './service.bicep' = [
  for (role, index) in ['web', 'lyric', 'melody']: {
    params: {
      name: 'ca-${role}-${suffix}'
      environmentName: environmentName
      location: location
      role: role
      environmentId: containerEnvironment.id
      environmentDomain: containerEnvironment.properties.defaultDomain
      runtimeIdentityId: identities[index].id
      runtimeClientId: identities[index].properties.clientId
      pullIdentityId: pullIdentity.id
      registryEndpoint: registry.properties.loginServer
      bootstrapImage: bootstrapImage
      audienceClientId: role == 'web' ? sellerApiClientId : backendApiClientId
      gatewayPrincipalId: role == 'web' ? null : gateway.identity!.principalId
      insightsConnectionString: insights.properties.ConnectionString
    }
    dependsOn: [pullRole]
  }
]

resource renderJob 'Microsoft.App/jobs@2026-07-01' = {
  name: 'job-render-${suffix}'
  location: location
  tags: union(tags, { 'azd-service-name': 'render' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identities[3].id}': {}
      '${pullIdentity.id}': {}
    }
  }
  properties: {
    environmentId: containerEnvironment.id
    configuration: {
      triggerType: 'Event'
      replicaTimeout: 300
      replicaRetryLimit: 0
      registries: [
        { server: registry.properties.loginServer, identity: pullIdentity.id }
      ]
      eventTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
        scale: {
          minExecutions: 0
          maxExecutions: 1
          pollingInterval: 30
          rules: [
            {
              name: 'render-queue'
              type: 'azure-queue'
              identity: identities[3].id
              metadata: {
                accountName: storage.name
                queueName: queue.name
                queueLength: '1'
              }
            }
          ]
        }
      }
    }
    template: {
      containers: [
        {
          name: 'main'
          image: bootstrapImage
          env: [
            { name: 'SERVICE_ROLE', value: 'render' }
            { name: 'AZURE_CLIENT_ID', value: identities[3].properties.clientId }
            { name: 'AZURE_STORAGE_ACCOUNT_NAME', value: storage.name }
            { name: 'RENDER_QUEUE_NAME', value: queue.name }
            { name: 'SPEECH_ENDPOINT', value: speech.properties.endpoint }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insights.properties.ConnectionString }
          ]
          resources: { cpu: json('0.5'), memory: '1Gi' }
        }
      ]
    }
  }
  dependsOn: [pullRole, queueRoles]
}

module mcp './mcp.bicep' = [
  for (role, index) in ['lyric', 'melody']: {
    params: {
      gatewayName: gateway.name
      name: role
      backendUrl: services[index + 1].outputs.endpoint
      sellerApiClientId: sellerApiClientId
      backendApiClientId: backendApiClientId
    }
  }
]

@description('Registry hostname.')
output registryEndpoint string = registry.properties.loginServer
@description('Web service URL.')
output webEndpoint string = services[0].outputs.endpoint
@description('Lyric MCP gateway URL.')
output lyricEndpoint string = mcp[0].outputs.endpoint
@description('Melody MCP gateway URL.')
output melodyEndpoint string = mcp[1].outputs.endpoint
@description('Storage resource name.')
output storageAccountName string = storage.name
@description('Private Blob endpoint.')
output blobEndpoint string = storage.properties.primaryEndpoints.blob
@description('Render queue name.')
output queueName string = queue.name
@description('Render job resource name.')
output renderJobName string = renderJob.name
@description('Azure OpenAI endpoint.')
output foundryEndpoint string = foundry.properties.endpoint
@description('Azure OpenAI deployment name.')
output modelDeploymentName string = model.name
@description('Content Safety endpoint.')
output safetyEndpoint string = safety.properties.endpoint
@description('Paid Speech endpoint.')
output speechEndpoint string = speech.properties.endpoint
@description('Vault URI.')
output vaultEndpoint string = vault.properties.vaultUri

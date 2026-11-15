metadata name = 'Earwyrm web platform'
metadata description = 'Container Apps, PostgreSQL, registry, managed secrets and Azure Files for the web proof.'

@description('azd environment name.')
param environmentName string
@description('Azure region.')
param location string
@description('Deployment principal object ID.')
param principalId string
@description('Existing Key Vault name containing the PostgreSQL password.')
param keyVaultName string
@description('Resource group containing the existing Key Vault.')
param keyVaultResourceGroupName string
@description('Existing Key Vault secret name for the PostgreSQL administrator password.')
param databasePasswordSecretName string
@description('PostgreSQL administrator login.')
param databaseAdminLogin string
@description('Address space for the application virtual network.')
param virtualNetworkAddressPrefix string
@description('Dedicated Container Apps subnet address prefix.')
param containerAppsSubnetPrefix string
@description('Private endpoint subnet address prefix.')
param privateEndpointsSubnetPrefix string
@description('Browser SPA client ID.')
param entraClientId string
@description('External ID CIAM authority.')
param entraAuthority string
@description('External ID discovery URL.')
param entraMetadataUrl string
@description('Exact discovery issuer.')
param entraExpectedIssuer string
@description('Expected API token audience.')
param entraAudience string
@description('API scope prefix.')
param entraApiScopePrefix string
@description('Temporary image used before azd deploy.')
param bootstrapImage string

var suffix = uniqueString(subscription().id, resourceGroup().id)
var tags = { 'azd-env-name': environmentName }
var shareName = 'earwyrm'
var environmentStorageName = 'earwyrmfiles'
var postgresName = 'psql${suffix}'
var databasePasswordSecretUri = '${credentialVault.properties.vaultUri}secrets/${databasePasswordSecretName}'
var containerAppsSubnetName = 'aca-infrastructure'
var privateEndpointsSubnetName = 'private-endpoints'

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2026-03-01' = {
  name: 'vnet-web-${suffix}'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: [virtualNetworkAddressPrefix] }
    subnets: [
      {
        name: containerAppsSubnetName
        properties: {
          addressPrefix: containerAppsSubnetPrefix
          delegations: [
            {
              name: 'container-apps'
              properties: { serviceName: 'Microsoft.App/environments' }
            }
          ]
        }
      }
      {
        name: privateEndpointsSubnetName
        properties: {
          addressPrefix: privateEndpointsSubnetPrefix
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

resource containerAppsSubnet 'Microsoft.Network/virtualNetworks/subnets@2026-03-01' existing = {
  parent: virtualNetwork
  name: containerAppsSubnetName
}

resource privateEndpointsSubnet 'Microsoft.Network/virtualNetworks/subnets@2026-03-01' existing = {
  parent: virtualNetwork
  name: privateEndpointsSubnetName
}

resource postgresDns 'Microsoft.Network/privateDnsZones@2024-06-01' = {
  name: 'privatelink.postgres.database.azure.com'
  location: 'global'
  tags: tags
}

resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01' = {
  parent: postgresDns
  name: 'postgres-${suffix}'
  location: 'global'
  tags: tags
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: virtualNetwork.id }
  }
}

resource credentialVault 'Microsoft.KeyVault/vaults@2026-05-15' existing = {
  scope: resourceGroup(keyVaultResourceGroupName)
  name: keyVaultName
}

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

module databasePasswordReader './keyvault-secret-reader.bicep' = {
  scope: resourceGroup(keyVaultResourceGroupName)
  params: {
    vaultName: keyVaultName
    secretName: databasePasswordSecretName
    principalId: pullIdentity.properties.principalId
  }
}

resource pullRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, pullIdentity.id, 'pull')
  properties: {
    principalId: pullIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource pushRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: registry
  name: guid(registry.id, principalId, 'push')
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')
  }
}

resource logs 'Microsoft.OperationalInsights/workspaces@2025-07-01' = {
  name: 'log-web-${suffix}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource containerEnvironment 'Microsoft.App/managedEnvironments@2026-03-02-preview' = {
  name: 'cae-web-${suffix}'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    appLogsConfiguration: { destination: 'azure-monitor' }
    publicNetworkAccess: 'Enabled'
    vnetConfiguration: {
      infrastructureSubnetId: containerAppsSubnet.id
      internal: false
    }
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
  name: 'stweb${suffix}'
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
    azureFilesIdentityBasedAuthentication: {
      directoryServiceOptions: 'None'
      smbOAuthSettings: { isSmbOAuthEnabled: true }
    }
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2025-06-01' = {
  parent: storage
  name: 'default'
  properties: {
    protocolSettings: { smb: { authenticationMethods: 'Kerberos' } }
    shareDeleteRetentionPolicy: { enabled: true, days: 7 }
  }
}

resource share 'Microsoft.Storage/storageAccounts/fileServices/shares@2025-06-01' = {
  parent: fileService
  name: shareName
  properties: {
    enabledProtocols: 'SMB'
    shareQuota: 100
  }
}

resource fileRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storage
  name: guid(storage.id, containerEnvironment.id, 'smb-mi-admin')
  properties: {
    principalId: containerEnvironment.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a235d3ee-5935-4cfb-8cc5-a3303ad5995e')
  }
}

resource environmentStorage 'Microsoft.App/managedEnvironments/storages@2026-03-02-preview' = {
  parent: containerEnvironment
  name: environmentStorageName
  properties: {
    azureFile: {
      accountName: storage.name
      identity: 'system'
      shareName: share.name
      accessMode: 'ReadWrite'
    }
  }
  dependsOn: [fileRole]
}

module postgres './postgresql.bicep' = {
  params: {
    name: postgresName
    location: location
    environmentName: environmentName
    administratorLogin: databaseAdminLogin
    administratorPassword: credentialVault.getSecret(databasePasswordSecretName)
    privateEndpointSubnetId: privateEndpointsSubnet.id
    privateDnsZoneId: postgresDns.id
  }
}

module web './service.bicep' = {
  params: {
    name: 'ca-app-${suffix}'
    environmentName: environmentName
    location: location
    environmentId: containerEnvironment.id
    environmentDomain: containerEnvironment.properties.defaultDomain
    pullIdentityId: pullIdentity.id
    registryEndpoint: registry.properties.loginServer
    bootstrapImage: bootstrapImage
    storageName: environmentStorage.name
    entraClientId: entraClientId
    entraAuthority: entraAuthority
    entraMetadataUrl: entraMetadataUrl
    entraExpectedIssuer: entraExpectedIssuer
    entraAudience: entraAudience
    entraApiScopePrefix: entraApiScopePrefix
    databaseHost: postgres.outputs.hostName
    databaseName: postgres.outputs.databaseName
    databaseAdminLogin: databaseAdminLogin
    databasePasswordSecretUri: databasePasswordSecretUri
  }
  dependsOn: [pullRole, databasePasswordReader, postgresDnsLink]
}

@description('Registry hostname.')
output registryEndpoint string = registry.properties.loginServer
@description('Web service URL.')
output webEndpoint string = web.outputs.endpoint
@description('Azure Files storage account name.')
output storageAccountName string = storage.name
@description('Azure Files share name.')
output shareName string = share.name
@description('Container Apps environment name.')
output environmentName string = containerEnvironment.name
@description('Container app name.')
output appName string = web.outputs.appName
@description('PostgreSQL Flexible Server hostname.')
output postgresHostName string = postgres.outputs.hostName
@description('PostgreSQL database name.')
output postgresDatabaseName string = postgres.outputs.databaseName
@description('Application virtual network name.')
output virtualNetworkName string = virtualNetwork.name

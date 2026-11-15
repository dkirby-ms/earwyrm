metadata name = 'Earwyrm web deployment'
metadata description = 'Deploy the existing web proof with an identity-authenticated Azure Files share.'

targetScope = 'subscription'

@description('Unique azd environment name.')
@minLength(3)
@maxLength(20)
param environmentName string

@description('Azure region for the application and storage.')
param location string

@description('Object ID of the deployment principal for registry publishing.')
param principalId string

@description('Existing Key Vault name containing the PostgreSQL password.')
@minLength(3)
@maxLength(24)
param keyVaultName string

@description('Resource group containing the existing Key Vault.')
@minLength(1)
param keyVaultResourceGroupName string

@description('Existing Key Vault secret name for the PostgreSQL administrator password.')
@minLength(1)
@maxLength(127)
param databasePasswordSecretName string

@description('PostgreSQL administrator login.')
@minLength(1)
@maxLength(63)
param databaseAdminLogin string

@description('Address space for the application virtual network.')
param virtualNetworkAddressPrefix string = '10.42.0.0/16'

@description('Dedicated subnet for the Container Apps workload profiles environment.')
param containerAppsSubnetPrefix string = '10.42.0.0/23'

@description('Separate, nondelegated subnet for private endpoints.')
param privateEndpointsSubnetPrefix string = '10.42.2.0/27'

@description('Existing browser SPA application client ID.')
@minLength(1)
param entraClientId string

@description('Existing External ID CIAM authority.')
@minLength(1)
param entraAuthority string

@description('Existing External ID OpenID Connect discovery URL.')
@minLength(1)
param entraMetadataUrl string

@description('Exact issuer from the discovery document.')
@minLength(1)
param entraExpectedIssuer string

@description('Expected audience of access tokens for the existing API.')
@minLength(1)
param entraAudience string

@description('Existing API application ID URI, without a trailing slash.')
@minLength(1)
param entraApiScopePrefix string

@description('Temporary image used until azd deploy publishes the web image.')
param bootstrapImage string = 'docker.io/nginxinc/nginx-unprivileged:1.28-alpine'

resource resourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: { 'azd-env-name': environmentName }
}

module platform './platform.bicep' = {
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    principalId: principalId
    keyVaultName: keyVaultName
    keyVaultResourceGroupName: keyVaultResourceGroupName
    databasePasswordSecretName: databasePasswordSecretName
    databaseAdminLogin: databaseAdminLogin
    virtualNetworkAddressPrefix: virtualNetworkAddressPrefix
    containerAppsSubnetPrefix: containerAppsSubnetPrefix
    privateEndpointsSubnetPrefix: privateEndpointsSubnetPrefix
    entraClientId: entraClientId
    entraAuthority: entraAuthority
    entraMetadataUrl: entraMetadataUrl
    entraExpectedIssuer: entraExpectedIssuer
    entraAudience: entraAudience
    entraApiScopePrefix: entraApiScopePrefix
    bootstrapImage: bootstrapImage
  }
}

@description('Resource group containing the web proof.')
output AZURE_RESOURCE_GROUP string = resourceGroup.name
@description('Registry hostname used by azd remote image builds.')
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = platform.outputs.registryEndpoint
@description('Web application HTTPS endpoint.')
output WEB_ENDPOINT string = platform.outputs.webEndpoint
@description('Azure Files storage account name.')
output AZURE_STORAGE_ACCOUNT_NAME string = platform.outputs.storageAccountName
@description('Azure Files share name.')
output AZURE_FILE_SHARE_NAME string = platform.outputs.shareName
@description('Container Apps environment name.')
output AZURE_CONTAINER_ENVIRONMENT_NAME string = platform.outputs.environmentName
@description('Container app name.')
output AZURE_CONTAINER_APP_NAME string = platform.outputs.appName
@description('PostgreSQL Flexible Server hostname.')
output AZURE_POSTGRESQL_HOST string = platform.outputs.postgresHostName
@description('PostgreSQL database name.')
output AZURE_POSTGRESQL_DATABASE string = platform.outputs.postgresDatabaseName
@description('Application virtual network for private database access and approved administration.')
output AZURE_VIRTUAL_NETWORK_NAME string = platform.outputs.virtualNetworkName

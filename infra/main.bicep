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
  name: 'rg-earwyrm-${environmentName}'
  location: location
  tags: { 'azd-env-name': environmentName }
}

module platform './platform.bicep' = {
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    principalId: principalId
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

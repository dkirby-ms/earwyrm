metadata name = 'Earwyrm foundation'
metadata description = 'Subscription entrypoint for an isolated accelerator environment.'

targetScope = 'subscription'

@description('Unique azd environment name, using lowercase letters, digits and hyphens.')
@minLength(3)
@maxLength(20)
param environmentName string

@description('Primary Azure region for compute, storage and monitoring.')
param location string

@description('Tenant application ID exposing the delegated Jingle.Create scope.')
@minLength(36)
@maxLength(36)
param sellerApiClientId string

@description('Separate tenant application ID used only as the MCP backend audience.')
@minLength(36)
@maxLength(36)
param backendApiClientId string

@description('Object ID of the principal running azd, for registry image publishing.')
param principalId string

@description('APIM publisher contact email, supplied by the deployment operator.')
param publisherEmail string

@description('Region with approved Azure OpenAI model access and quota.')
param modelLocation string = 'eastus2'

@description('Azure OpenAI model name; confirm availability and lifecycle before provisioning.')
param modelName string = 'gpt-4.1-mini'

@description('Exact model version approved for this environment.')
param modelVersion string = '2025-04-14'

@description('Model deployment type; GlobalStandard may process outside the resource region.')
@allowed(['GlobalStandard', 'Standard'])
param modelSku string = 'GlobalStandard'

@description('Model capacity units; subject to subscription-specific model quota.')
@minValue(1)
param modelCapacity int = 10

@description('Region supporting Content Safety moderation and protected-material text detection.')
param safetyLocation string = 'eastus2'

@description('Region supporting paid Speech and the stock en-US-JennyNeural voice.')
param speechLocation string = 'eastus2'

@description('MCP-capable APIM tier; Developer is non-production with no SLA.')
@allowed(['Developer', 'Basic', 'Standard', 'Premium'])
param apimSku string = 'Developer'

@description('Bootstrap image listening on 8080, without an application-specific command.')
param bootstrapImage string = 'docker.io/nginxinc/nginx-unprivileged:1.28-alpine'

resource resourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: 'rg-earwyrm-${environmentName}'
  location: location
  tags: {
    'azd-env-name': environmentName
  }
}

module platform './platform.bicep' = {
  scope: resourceGroup
  params: {
    environmentName: environmentName
    location: location
    sellerApiClientId: sellerApiClientId
    backendApiClientId: backendApiClientId
    principalId: principalId
    publisherEmail: publisherEmail
    modelLocation: modelLocation
    modelName: modelName
    modelVersion: modelVersion
    modelSku: modelSku
    modelCapacity: modelCapacity
    safetyLocation: safetyLocation
    speechLocation: speechLocation
    apimSku: apimSku
    bootstrapImage: bootstrapImage
  }
}

@description('Isolated environment resource group.')
output AZURE_RESOURCE_GROUP string = resourceGroup.name
@description('Registry hostname used by azd remote image builds.')
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = platform.outputs.registryEndpoint
@description('Authenticated web scaffold endpoint.')
output WEB_ENDPOINT string = platform.outputs.webEndpoint
@description('Seller-authenticated lyric MCP endpoint.')
output LYRIC_MCP_ENDPOINT string = platform.outputs.lyricEndpoint
@description('Seller-authenticated melody MCP endpoint.')
output MELODY_MCP_ENDPOINT string = platform.outputs.melodyEndpoint
@description('Storage account resource name.')
output AZURE_STORAGE_ACCOUNT_NAME string = platform.outputs.storageAccountName
@description('Private Blob endpoint; no SAS credentials.')
output BLOB_ENDPOINT string = platform.outputs.blobEndpoint
@description('Render queue name.')
output RENDER_QUEUE_NAME string = platform.outputs.queueName
@description('Render Container App Job name.')
output RENDER_JOB_NAME string = platform.outputs.renderJobName
@description('Configured Foundry Azure OpenAI endpoint.')
output LYRIC_FOUNDRY_ENDPOINT string = platform.outputs.foundryEndpoint
@description('Model deployment name.')
output LYRIC_MODEL_DEPLOYMENT string = platform.outputs.modelDeploymentName
@description('Content Safety endpoint.')
output LYRIC_CONTENT_SAFETY_ENDPOINT string = platform.outputs.safetyEndpoint
@description('Paid Speech resource endpoint.')
output SPEECH_ENDPOINT string = platform.outputs.speechEndpoint
@description('Empty RBAC-enabled vault for any future unavoidable secrets.')
output KEY_VAULT_ENDPOINT string = platform.outputs.vaultEndpoint

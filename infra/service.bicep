metadata name = 'Earwyrm web service'
metadata description = 'Same-origin web UI and API backed by PostgreSQL and a mounted Azure file share.'

import { SpeechSettings, LyricSettings } from './paid-ai-types.bicep'

@description('Container app name.')
param name string
@description('azd environment name.')
param environmentName string
@description('Azure region.')
param location string
@description('Container Apps environment resource ID.')
param environmentId string
@description('Container Apps environment DNS suffix.')
param environmentDomain string
@description('Registry-pull identity resource ID.')
param pullIdentityId string
@description('Registry hostname.')
param registryEndpoint string
@description('Temporary image used before azd deploy.')
param bootstrapImage string
@description('Environment Azure Files storage definition name.')
param storageName string
@description('Existing browser SPA client ID.')
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
@description('PostgreSQL Flexible Server hostname.')
param databaseHost string
@description('PostgreSQL database name.')
param databaseName string
@description('PostgreSQL administrator login.')
param databaseAdminLogin string
@description('Versionless Key Vault URI tracking the latest PostgreSQL password.')
param databasePasswordSecretUri string

@description('Approved Speech settings, or null to leave disabled.')
param speechSettings SpeechSettings?
@description('Approved text generation settings, or null to leave disabled.')
param lyricSettings LyricSettings?
@description('Shared Foundry account name.')
param aiName string
@description('Shared Foundry account region.')
param aiLocation string
@description('Shared Foundry account resource ID, if enabled.')
param aiResourceId string?
@description('Provisioned Foundry model deployment name.')
param lyricDeploymentName string
@description('Application managed identity client ID used for paid AI requests.')
param webClientId string

var hostname = '${name}.${environmentDomain}'
var toolsEndpoint = 'https://${aiName}.cognitiveservices.azure.com'

var speechEnv = speechSettings == null ? [] : [
  { name: 'SPEECH_ENDPOINT', value: toolsEndpoint }
  { name: 'SPEECH_MANAGED_IDENTITY_CLIENT_ID', value: webClientId }
  { name: 'SPEECH_RESOURCE_ID', value: aiResourceId! }
  { name: 'SPEECH_REGION', value: aiLocation }
  {
    name: 'SPEECH_RATE_EVIDENCE'
    value: string({
      tier: 'S0'
      region: aiLocation
      resource_reference: aiResourceId
      usd_per_million_characters: speechSettings!.usdPerMillionCharacters
      rate_source: speechSettings!.rateSource
      rate_checked_on: speechSettings!.rateCheckedOn
    })
  }
  { name: 'SPEECH_PER_RUN_CAP_USD', value: speechSettings!.perRunCapUsd }
  { name: 'SPEECH_TOTAL_BUDGET_USD', value: speechSettings!.totalBudgetUsd }
]

var lyricEnv = lyricSettings == null ? [] : [
  { name: 'LYRIC_FOUNDRY_ENDPOINT', value: 'https://${aiName}.openai.azure.com' }
  { name: 'LYRIC_MODEL_DEPLOYMENT', value: lyricDeploymentName }
  { name: 'LYRIC_CONTENT_SAFETY_ENDPOINT', value: toolsEndpoint }
  { name: 'LYRIC_MODEL_CALL_MAX_USD', value: lyricSettings!.modelCallMaxUsd }
  { name: 'LYRIC_SAFETY_CALL_MAX_USD', value: lyricSettings!.safetyCallMaxUsd }
  { name: 'LYRIC_PER_ACTION_CAP_USD', value: lyricSettings!.perActionCapUsd }
  { name: 'LYRIC_TOTAL_BUDGET_USD', value: lyricSettings!.totalBudgetUsd }
  { name: 'LYRIC_MANAGED_IDENTITY_CLIENT_ID', value: webClientId }
]

resource app 'Microsoft.App/containerApps@2026-07-01' = {
  name: name
  location: location
  tags: {
    'azd-env-name': environmentName
    'azd-service-name': 'web'
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${pullIdentityId}': {}
    }
  }
  properties: {
    environmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: [
        {
          name: 'postgres-admin-password'
          keyVaultUrl: databasePasswordSecretUri
          identity: pullIdentityId
        }
      ]
      ingress: {
        external: true
        allowInsecure: false
        targetPort: 8080
        transport: 'http'
      }
      registries: [{ server: registryEndpoint, identity: pullIdentityId }]
    }
    template: {
      containers: [
        {
          name: 'main'
          image: bootstrapImage
          env: concat([
            { name: 'ENTRA_CLIENT_ID', value: entraClientId }
            { name: 'ENTRA_AUTHORITY', value: entraAuthority }
            { name: 'ENTRA_METADATA_URL', value: entraMetadataUrl }
            { name: 'ENTRA_EXPECTED_ISSUER', value: entraExpectedIssuer }
            { name: 'ENTRA_AUDIENCE', value: entraAudience }
            { name: 'ENTRA_API_SCOPE_PREFIX', value: entraApiScopePrefix }
            { name: 'EARWYRM_DATABASE_HOST', value: databaseHost }
            { name: 'EARWYRM_DATABASE_NAME', value: databaseName }
            { name: 'EARWYRM_DATABASE_USER', value: databaseAdminLogin }
            { name: 'EARWYRM_DATABASE_PASSWORD', secretRef: 'postgres-admin-password' }
            { name: 'EARWYRM_DATA_DIR', value: '/mnt/earwyrm' }
            { name: 'SPEECH_ENABLED', value: string(speechSettings != null) }
            { name: 'LYRIC_ENABLED', value: string(lyricSettings != null) }
          ], speechEnv, lyricEnv)
          volumeMounts: [{ volumeName: 'earwyrm', mountPath: '/mnt/earwyrm' }]
          resources: { cpu: json('0.5'), memory: '1Gi' }
          probes: [
            { type: 'Liveness', tcpSocket: { port: 8080 }, initialDelaySeconds: 10, periodSeconds: 30 }
            { type: 'Readiness', tcpSocket: { port: 8080 }, periodSeconds: 10 }
          ]
        }
      ]
      volumes: [
        {
          name: 'earwyrm'
          storageName: storageName
          storageType: 'AzureFile'
          mountOptions: 'uid=10001,gid=10001,dir_mode=0700,file_mode=0600,nobrl'
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

@description('HTTPS web endpoint.')
output endpoint string = 'https://${hostname}'
@description('Container app name.')
output appName string = app.name

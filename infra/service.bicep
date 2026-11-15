metadata name = 'Earwyrm web service'
metadata description = 'Same-origin web UI and API backed by a mounted Azure file share.'

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

var hostname = '${name}.${environmentDomain}'

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
          env: [
            { name: 'ENTRA_CLIENT_ID', value: entraClientId }
            { name: 'ENTRA_AUTHORITY', value: entraAuthority }
            { name: 'ENTRA_METADATA_URL', value: entraMetadataUrl }
            { name: 'ENTRA_EXPECTED_ISSUER', value: entraExpectedIssuer }
            { name: 'ENTRA_AUDIENCE', value: entraAudience }
            { name: 'ENTRA_API_SCOPE_PREFIX', value: entraApiScopePrefix }
            { name: 'EARWYRM_DATA_DIR', value: '/mnt/earwyrm' }
            { name: 'SPEECH_ENABLED', value: 'false' }
          ]
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

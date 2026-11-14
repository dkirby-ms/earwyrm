metadata name = 'Earwyrm service'
metadata description = 'One authenticated, stateless container scaffold with an explicit runtime identity.'

@description('Container app resource name.')
param name string
@description('azd environment name.')
param environmentName string
@description('Compute region.')
param location string
@description('Role and azd service discovery name.')
@allowed(['web', 'lyric', 'melody'])
param role string
@description('Managed environment resource ID.')
param environmentId string
@description('Managed environment default DNS suffix.')
param environmentDomain string
@description('Runtime user-assigned managed identity resource ID.')
param runtimeIdentityId string
@description('Runtime identity client ID for DefaultAzureCredential.')
param runtimeClientId string
@description('Registry-pull identity resource ID.')
param pullIdentityId string
@description('ACR hostname.')
param registryEndpoint string
@description('Initial bootstrap image, replaced by azd deploy.')
param bootstrapImage string
@description('Entra application ID for this service audience.')
param audienceClientId string
@description('Gateway service-principal object ID; null for the web service.')
param gatewayPrincipalId string?
@description('Workspace-backed Application Insights connection string.')
param insightsConnectionString string

var hostname = '${name}.${environmentDomain}'

resource app 'Microsoft.App/containerApps@2026-07-01' = {
  name: name
  location: location
  tags: {
    'azd-env-name': environmentName
    'azd-service-name': role
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${runtimeIdentityId}': {}
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
      registries: [
        {
          server: registryEndpoint
          identity: pullIdentityId
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'main'
          image: bootstrapImage
          env: [
            { name: 'SERVICE_ROLE', value: role }
            { name: 'AZURE_CLIENT_ID', value: runtimeClientId }
            { name: 'PLATFORM_ALLOWED_HOST', value: hostname }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: insightsConnectionString }
            { name: 'OTEL_SERVICE_NAME', value: 'earwyrm-${role}' }
            {
              name: 'OTEL_RESOURCE_ATTRIBUTES'
              value: 'service.version=0.1.0,deployment.environment=${environmentName}'
            }
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          probes: [
            {
              type: 'Liveness'
              tcpSocket: { port: 8080 }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              tcpSocket: { port: 8080 }
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: { minReplicas: 0, maxReplicas: 1 }
    }
  }
}

resource auth 'Microsoft.App/containerApps/authConfigs@2026-07-01' = {
  parent: app
  name: 'current'
  properties: {
    platform: { enabled: true }
    globalValidation: {
      unauthenticatedClientAction: 'Return401'
      excludedPaths: ['/healthz']
    }
    httpSettings: { requireHttps: true }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          clientId: audienceClientId
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenant().tenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [audienceClientId, 'api://${audienceClientId}']
          defaultAuthorizationPolicy: gatewayPrincipalId == null
            ? {}
            : {
                allowedPrincipals: {
                  identities: [gatewayPrincipalId!]
                }
              }
        }
      }
    }
  }
}

@description('HTTPS container endpoint; auth permits only the configured callers.')
output endpoint string = 'https://${hostname}'

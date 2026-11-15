metadata name = 'PostgreSQL password reader role'
metadata description = 'Grants one managed identity read access to the selected Key Vault secret.'

@description('Name of the existing Key Vault.')
param vaultName string
@description('Name of the PostgreSQL password secret.')
param secretName string
@description('Principal ID of the managed identity that reads the secret.')
param principalId string

resource vault 'Microsoft.KeyVault/vaults@2026-05-15' existing = {
  name: vaultName
}

resource secret 'Microsoft.KeyVault/vaults/secrets@2025-05-01' existing = {
  parent: vault
  name: secretName
}

resource secretReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: secret
  name: guid(secret.id, principalId, 'read-postgresql-password')
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

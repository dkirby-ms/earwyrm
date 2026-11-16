metadata name = 'Earwyrm PostgreSQL database'
metadata description = 'A low-cost PostgreSQL Flexible Server reachable only through a private endpoint.'

@description('PostgreSQL Flexible Server name.')
param name string
@description('Azure region for PostgreSQL.')
param location string
@description('azd environment name.')
param environmentName string
@description('PostgreSQL administrator login.')
param administratorLogin string
@secure()
@description('Administrator password read from the existing Key Vault.')
param administratorPassword string
@description('Nondelegated subnet for the PostgreSQL private endpoint.')
param privateEndpointSubnetId string
@description('Private DNS zone linked to the application virtual network.')
param privateDnsZoneId string

var databaseName = 'earwyrm'
var tags = { 'azd-env-name': environmentName }

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2026-10-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Standard_B2s'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorPassword
    authConfig: {
      activeDirectoryAuth: 'Disabled'
      passwordAuth: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Disabled'
    }
    storage: {
      autoGrow: 'Enabled'
      storageSizeGB: 32
      tier: 'P4'
    }
    version: '16'
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2026-10-01' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource privateEndpoint 'Microsoft.Network/privateEndpoints@2026-03-01' = {
  name: 'pe-${name}'
  location: location
  tags: tags
  properties: {
    subnet: { id: privateEndpointSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'postgresql'
        properties: {
          privateLinkServiceId: server.id
          groupIds: ['postgresqlServer']
        }
      }
    ]
  }
}

resource privateDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2026-03-01' = {
  parent: privateEndpoint
  name: 'postgresql'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'postgresql'
        properties: { privateDnsZoneId: privateDnsZoneId }
      }
    ]
  }
}

@description('PostgreSQL Flexible Server hostname.')
output hostName string = server.properties.fullyQualifiedDomainName
@description('PostgreSQL database name.')
output databaseName string = database.name

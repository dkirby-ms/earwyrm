metadata name = 'Earwyrm PostgreSQL database'
metadata description = 'A low-cost PostgreSQL Flexible Server with explicit public firewall rules.'

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
@description('Comma-separated verified outbound IPv4 addresses allowed to reach PostgreSQL.')
@minLength(1)
param outboundIpv4s string

var databaseName = 'earwyrm'
var firewallAddresses = split(outboundIpv4s, ',')
var tags = { 'azd-env-name': environmentName }

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2026-10-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
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
      publicNetworkAccess: 'Enabled'
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

resource firewallRules 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2026-10-01' = [for (address, index) in firewallAddresses: {
  parent: server
  name: 'container-app-egress-${index}'
  properties: {
    startIpAddress: address
    endIpAddress: address
  }
}]

@description('PostgreSQL Flexible Server hostname.')
output hostName string = server.properties.fullyQualifiedDomainName
@description('PostgreSQL database name.')
output databaseName string = database.name

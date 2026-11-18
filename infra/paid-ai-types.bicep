@export()
@sealed()
@description('Approved Speech spending limits.')
type SpeechSettings = {
  @minLength(1)
  perRunCapUsd: string
  @minLength(1)
  totalBudgetUsd: string
}

@export()
@sealed()
@description('Approved metered Foundry model deployment and spending limits.')
type LyricSettings = {
  @minLength(1)
  modelName: string
  @minLength(1)
  modelVersion: string
  modelSku: 'Standard' | 'GlobalStandard' | 'DataZoneStandard'
  @minValue(1)
  modelCapacity: int
  @minLength(1)
  modelCallMaxUsd: string
  @minLength(1)
  safetyCallMaxUsd: string
  @minLength(1)
  perActionCapUsd: string
  @minLength(1)
  totalBudgetUsd: string
}

@export()
@sealed()
@description('Speech rate evidence and spending limits.')
type SpeechSettings = {
  @minLength(1)
  usdPerMillionCharacters: string
  @minLength(1)
  rateSource: string
  @minLength(1)
  rateCheckedOn: string
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

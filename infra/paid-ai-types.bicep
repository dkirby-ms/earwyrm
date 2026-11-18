@export()
@sealed()
@description('Approved Speech settings, excluding the Speech key itself.')
type SpeechSettings = {
  @minLength(1)
  @maxLength(127)
  keySecretName: string
  @minLength(1)
  region: string
  @minLength(1)
  perRunCapUsd: string
  @minLength(1)
  totalBudgetUsd: string
}

@export()
@sealed()
@description('Approved shared Foundry and Content Safety settings.')
type LyricSettings = {
  @minLength(1)
  foundryEndpoint: string
  @minLength(1)
  modelDeployment: string
  @minLength(1)
  safetyEndpoint: string
  @minLength(1)
  modelCallMaxUsd: string
  @minLength(1)
  safetyCallMaxUsd: string
  @minLength(1)
  perActionCapUsd: string
  @minLength(1)
  totalBudgetUsd: string
}

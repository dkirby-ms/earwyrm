import { Decimal } from 'decimal.js';
import { CloudFailure } from './lyric_cloud.js';

const Money = Decimal.clone({ precision: 28 });
const ceilings = {
  discuss: { model: 2, safety: 2 },
  write: { model: 9, safety: 2 },
  options: { model: 27, safety: 6 },
  compose: { model: 1, safety: 0 },
} as const;

/** Identifies one web action and its worst-case provider workload. */
export type PaidLyricAction = keyof typeof ceilings;
/** Paid lyric actions with a separate legacy reservation table. */
export type PaidLyricGenerationAction = Exclude<PaidLyricAction, 'compose'>;

function price(env: Record<string, string | undefined>, name: string): Decimal {
  const raw = env[name]?.trim();
  if (!raw || !/^\d{1,8}(?:\.\d{1,12})?$/.test(raw)) throw new CloudFailure('invalid_lyric_budget');
  const value = new Money(raw);
  if (value.lte(0)) throw new CloudFailure('invalid_lyric_budget');
  return value;
}

/** Requires positive operator-approved upper bounds and caps, in USD. */
export function lyric_budget(env: Record<string, string | undefined>) {
  return {
    model: price(env, 'LYRIC_MODEL_CALL_MAX_USD'),
    safety: price(env, 'LYRIC_SAFETY_CALL_MAX_USD'),
    per_action: price(env, 'LYRIC_PER_ACTION_CAP_USD'),
    total: price(env, 'LYRIC_TOTAL_BUDGET_USD'),
  };
}

/** Returns the full reservation and a call guard scoped to that single action. */
export function lyric_allowance(action: PaidLyricAction | 'jingle_write', budget: ReturnType<typeof lyric_budget>) {
  const remaining = action === 'jingle_write'
    ? { model: ceilings.write.model + 1, safety: ceilings.write.safety }
    : { ...ceilings[action] };
  return {
    cost: budget.model.times(remaining.model).plus(budget.safety.times(remaining.safety)),
    consume(kind: keyof typeof remaining): void {
      if (remaining[kind] <= 0) throw new CloudFailure('lyric_call_limit');
      remaining[kind]--;
    },
  };
}

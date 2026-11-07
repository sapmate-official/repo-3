const UNIT_TO_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000
};

export const parseDurationMs = (value: string): number => {
  const match = /^(?<amount>\d+)\s*(?<unit>ms|s|m|h|d)$/.exec(value.trim());
  const amount = match?.groups?.amount;
  const unit = match?.groups?.unit;

  if (!amount || !unit) {
    throw new Error(`Invalid duration value: "${value}"`);
  }

  const multiplier = UNIT_TO_MS[unit];
  if (!multiplier) {
    throw new Error(`Unsupported duration unit: "${unit}"`);
  }

  return Number(amount) * multiplier;
};

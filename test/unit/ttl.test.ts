import { describe, expect, it } from 'vitest';
import { parseDurationMs } from '../../src/util/ttl.js';

describe('parseDurationMs', () => {
  it.each([
    ['500ms', 500],
    ['15s', 15_000],
    ['15m', 900_000],
    ['2h', 7_200_000],
    ['7d', 604_800_000]
  ])('parses %s', (value, expected) => {
    expect(parseDurationMs(value)).toBe(expected);
  });

  it.each(['', '15', 'abc', '1w', '-5m', '15 m ago'])('rejects invalid value "%s"', (value) => {
    expect(() => parseDurationMs(value)).toThrow(/Invalid duration|Unsupported duration/);
  });
});

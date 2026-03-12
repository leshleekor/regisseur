/**
 * Calculates the BullMQ delay for a one-time schedule.
 *
 * Values in the past are clamped to zero so callers can treat them as
 * immediate jobs.
 */
export function calculateDelayMs(
  runAtIsoString: string,
  now: Date = new Date(),
): number {
  const runAtTimestamp = new Date(runAtIsoString).getTime();

  if (Number.isNaN(runAtTimestamp)) {
    throw new Error(`Invalid runAt timestamp: ${runAtIsoString}`);
  }

  return Math.max(0, runAtTimestamp - now.getTime());
}

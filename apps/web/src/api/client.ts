import { healthStatusSchema, type HealthStatus } from "@slabx/contracts";

export async function getApiHealth(
  signal?: AbortSignal,
): Promise<HealthStatus> {
  const response = await fetch("/api/v1/health/live", {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok)
    throw new Error("SlabX services are temporarily unavailable.");
  return healthStatusSchema.parse(await response.json());
}

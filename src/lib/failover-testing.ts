import { cacheGet, cacheSet } from "@/lib/cache";

const FAILOVER_PREFIX = "failover:";

export type FailoverTest = {
  id: string;
  name: string;
  streamId: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  startedAt: number;
  completedAt?: number;
};

export async function createFailoverTest(
  name: string,
  streamId: string
): Promise<FailoverTest> {
  const test: FailoverTest = {
    id: `failover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    streamId,
    status: "pending",
    startedAt: Date.now(),
  };

  const tests = await getFailoverTests();
  tests.push(test);
  await cacheSet(`${FAILOVER_PREFIX}all`, tests, 86400);
  return test;
}

export async function getFailoverTests(): Promise<FailoverTest[]> {
  return (await cacheGet<FailoverTest[]>(`${FAILOVER_PREFIX}all`)) ?? [];
}

export async function updateFailoverTest(
  testId: string,
  status: FailoverTest["status"],
  result?: string
): Promise<boolean> {
  const tests = await getFailoverTests();
  const idx = tests.findIndex((t) => t.id === testId);
  if (idx < 0) return false;
  tests[idx].status = status;
  if (result) tests[idx].result = result;
  if (status === "completed" || status === "failed") {
    tests[idx].completedAt = Date.now();
  }
  await cacheSet(`${FAILOVER_PREFIX}all`, tests, 86400);
  return true;
}

export async function deleteFailoverTest(testId: string): Promise<boolean> {
  const tests = await getFailoverTests();
  const filtered = tests.filter((t) => t.id !== testId);
  await cacheSet(`${FAILOVER_PREFIX}all`, filtered, 86400);
  return true;
}

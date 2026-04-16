type TestFn = () => void | Promise<void>;

interface RegisteredTest {
  name: string;
  fn: TestFn;
}

const tests: RegisteredTest[] = [];

export function test(name: string, fn: TestFn): void {
  tests.push({ name, fn });
}

export async function runTests(): Promise<void> {
  let failures = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.stack || error.message : String(error);
      process.stderr.write(`not ok - ${name}\n${message}\n`);
    }
  }

  if (failures > 0) {
    throw new Error(`${failures} test(s) failed`);
  }

  process.stdout.write(`${tests.length} test(s) passed\n`);
}

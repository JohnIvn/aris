/**
 * This file intentionally contains lint errors so that `npm run lint`
 * reports a failure. It is not used anywhere in the application.
 */

function fetchData(): Promise<string> {
  return Promise.resolve('data');
}

fetchData().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Error Lint Trigger');
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const unusedVariable = 42;

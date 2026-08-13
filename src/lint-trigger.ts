/**
 * This file intentionally contains lint errors so that `npm run lint`
 * reports a failure. It is not used anywhere in the application.
 */

function fetchData(): Promise<string> {
  return Promise.resolve('data');
}

// @typescript-eslint/no-floating-promises: floating promise not awaited/handled
fetchData();

const unusedVariable = 42; // @typescript-eslint/no-unused-vars (auto-fixable)

# Fixtures

`orders-app/` is the orders dashboard from `src/samples/orders.flow.yaml`, written as real React code.
It is input for the code reader's tests (`src/reader/read-code.test.ts`, `e2e/code-reader.spec.ts`).

The code contains deliberate flaws (prop drilling, a mutation, server data copied into state) so the
reader and the rules have something to find. It is not compiled or linted, and its imports are not installed.

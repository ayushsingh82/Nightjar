// agent-commerce — the contracts package's public surface.
//
// The app imports the compiled contract from here (`@agent-commerce/contracts`)
// so transaction assembly runs the *same* generated circuit code the test suite
// does, rather than a second copy that could drift.
//
// `src/managed/` is build output — run `npm run compact:fast` in this package
// before building the app, and `npm run compact` when you need the proving keys.
// Both are gitignored: they are reproducible from `marketplace.compact`, and
// the keys are 57MB.

export {
  Contract,
  ledger,
  pureCircuits,
  EscrowState,
  contractReferenceLocations,
} from "./managed/marketplace/contract/index.js";

export type {
  Circuits,
  ImpureCircuits,
  Ledger,
  PureCircuits,
  Witnesses,
} from "./managed/marketplace/contract/index.js";

export * from "./witnesses";
export * from "./reputation";

/** The circuits a client can call, i.e. everything but the constructor. */
export const CIRCUIT_IDS = [
  "registerAgent",
  "updateReputation",
  "proveReputation",
  "stakeBond",
  "withdrawBond",
  "openEscrow",
  "markDelivered",
  "release",
  "dispute",
  "resolveDispute",
] as const;

export type CircuitId = (typeof CIRCUIT_IDS)[number];

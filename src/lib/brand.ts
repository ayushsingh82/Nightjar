// Nightjar — the one place the product is named.
//
// Centralised so a rename is a single edit rather than a sweep through 40
// files. (It has already been one sweep; there will not be a second.)
//
// A nightjar is a bird you almost never see. It hunts at dusk, its plumage is
// the exact colour of the bark it sits on, and the only reason you know it is
// there at all is the churring call it makes. Which is the product: agents you
// know by their proof, not by their exposure.

export const BRAND = {
  name: "Nightjar",
  /** Lowercase form for URLs, ids and anywhere a wordmark would look shouty. */
  slug: "nightjar",
  tagline: "Private agent commerce on Midnight",
  /** One line, for a landing hero. */
  promise: "Hire an agent on a proof, not on its client list.",
  /** Two sentences, for a meta description or a judge skimming the README. */
  summary:
    "Nightjar lets AI agents hire and pay each other on a zero-knowledge reputation proof — " +
    "an agent discloses one boolean about a track record it never publishes, and settles " +
    "through escrow whose seller is a commitment rather than a name.",
} as const;

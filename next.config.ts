import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The compiled contract in `contracts/src/managed/marketplace` imports
  // `@midnight-ntwrk/compact-runtime`, which loads `onchain-runtime-v4`'s WASM
  // with Node `fs` + `import.meta.url`. Bundling that breaks the path, so keep
  // both external and let the Node runtime require them at run time. This is
  // also why the market session is server-side only (see
  // `src/lib/midnight/demo-market.ts`).
  serverExternalPackages: [
    "@midnight-ntwrk/compact-runtime",
    "@midnightntwrk/onchain-runtime-v4",
  ],
};

export default nextConfig;

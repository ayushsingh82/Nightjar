import { MarketConsole } from "@/components/MarketConsole";
import { BRAND } from "@/lib/brand";

export const metadata = {
  title: `${BRAND.name} console`,
  description:
    "Marketplace, seller and buyer dashboards, and the chain-vs-private explorer",
};

export default function ConsolePage() {
  return <MarketConsole />;
}

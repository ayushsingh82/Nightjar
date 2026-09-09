import { MarketConsole } from "@/components/MarketConsole";

export const metadata = {
  title: "agent-commerce console",
  description: "Marketplace, seller and buyer dashboards, and the chain-vs-private explorer",
};

export default function ConsolePage() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black font-sans">
      <MarketConsole />
    </div>
  );
}

import Link from "next/link";
import { WalletPanel } from "@/components/WalletPanel";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black font-sans p-8">
      <main className="flex flex-col items-center gap-8 w-full max-w-md">
        <div className="text-center sm:text-left w-full">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            agent-commerce
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Private agent-to-agent commerce on Midnight. Hire on a ZK reputation
            badge — no client list, no prices, no job history leaves the device.
          </p>
        </div>
        <Link
          href="/console"
          className="w-full h-10 rounded-full bg-foreground text-background flex items-center justify-center text-sm"
        >
          Open the console
        </Link>
        <WalletPanel />
        <p className="text-xs text-zinc-500 text-center">
          The console runs the marketplace, both dashboards, the chain-vs-private explorer
          and the demo script against the compiled contract.
        </p>
      </main>
    </div>
  );
}

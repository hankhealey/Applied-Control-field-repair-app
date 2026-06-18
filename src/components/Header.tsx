"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export default function Header() {
  const router = useRouter();
  return (
    <header className="flex items-center border-b border-zinc-200 bg-white px-5 py-3">
      {/* Applied Control logo — acts as a subtle home button */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-3 opacity-90 transition-opacity hover:opacity-100"
        aria-label="Go to home"
      >
        <Image
          src="/applied-control-logo.png"
          alt="Applied Control"
          width={240}
          height={74}
          className="h-8 w-auto"
          priority
        />
        <p className="text-xs font-medium tracking-widest text-zinc-400">
          FIELD REPAIR REPORTS
        </p>
      </button>
    </header>
  );
}

"use client";

import Image from "next/image";

/** Map pin pointing at the location, showing the establishment's logo/photo. */
export default function LogoPin({ logo, name }: { logo: string; name: string }) {
  // Section map icons (bundled SVGs) carry their own background: show them
  // full-bleed; real logos/photos are letterboxed on white.
  const isSectionIcon = logo.endsWith(".svg");
  return (
    <div className="flex flex-col items-center drop-shadow-md">
      <div className="relative h-11 w-11 overflow-hidden rounded-lg border border-neutral-300 bg-white">
        <Image
          src={logo}
          alt={name}
          fill
          unoptimized={isSectionIcon}
          className={isSectionIcon ? "object-cover" : "object-contain p-1"}
          sizes="44px"
        />
      </div>
      {/* pointer tail */}
      <div className="-mt-px h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent border-t-white" />
    </div>
  );
}

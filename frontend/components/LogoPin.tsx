"use client";

import Image from "next/image";

interface LogoPinProps {
  logo: string;
  name: string;
  /**
   * The establishment the page is about. Its pin is framed in dark brand blue
   * and sits above the rest, so the visitor tells it apart from the white
   * neighbourhood pins at a glance.
   */
  current?: boolean;
  /**
   * Pointed at from the nearby list: the pin grows and takes a brand ring, so
   * hovering a row says which pin on the map it is.
   */
  highlighted?: boolean;
}

/** Map pin pointing at the location, showing the establishment's logo/photo. */
export default function LogoPin({
  logo,
  name,
  current = false,
  highlighted = false,
}: LogoPinProps) {
  // Section map icons (bundled SVGs) carry their own background: show them
  // full-bleed; real logos/photos are letterboxed on white.
  const isSectionIcon = logo.endsWith(".svg");
  const plate = (
    <div
      className={`logo-plate relative overflow-hidden rounded-lg border bg-white ${
        current ? "h-12 w-12 border-brand-800" : "h-11 w-11 border-neutral-300"
      } ${highlighted ? "border-brand-600 ring-2 ring-brand-600" : ""}`}
    >
      <Image
        src={logo}
        alt={name}
        fill
        unoptimized={isSectionIcon}
        className={isSectionIcon ? "object-cover" : "object-contain p-1"}
        sizes={current ? "48px" : "44px"}
      />
    </div>
  );

  // Grown from the tip, so the pin keeps pointing at the same coordinates.
  const grow = `origin-bottom transition-transform duration-150 ${
    highlighted ? "scale-125" : ""
  }`;

  if (!current) {
    return (
      <div
        className={`flex flex-col items-center ${grow} ${
          highlighted ? "drop-shadow-xl" : "drop-shadow-md"
        }`}
      >
        {plate}
        {/* pointer tail */}
        <div
          className={`-mt-px h-0 w-0 border-x-[7px] border-t-[9px] border-x-transparent ${
            highlighted ? "border-t-brand-600" : "border-t-white"
          }`}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center drop-shadow-xl ${grow}`}>
      <div className="rounded-xl bg-brand-800 p-1 ring-2 ring-white">
        {plate}
      </div>
      {/* pointer tail, in the dark frame's colour */}
      <div className="-mt-px h-0 w-0 border-x-[9px] border-t-[12px] border-x-transparent border-t-brand-800" />
    </div>
  );
}

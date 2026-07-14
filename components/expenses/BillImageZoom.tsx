"use client";

import { useState } from "react";

// Amazon-style hover magnifier for bill images: while the cursor is over the
// image, it scales up in place with the transform-origin pinned to the cursor,
// so the area under the mouse is what gets magnified. Mouse-out restores the
// full view; click still opens the original in a new tab (and remains the only
// affordance on touch devices, which never hover).
const ZOOM = 2.5;

export function BillImageZoom({
  src,
  alt,
  href,
}: {
  src: string;
  alt: string;
  href: string;
}) {
  const [origin, setOrigin] = useState<string | null>(null);

  return (
    <a href={href} target="_blank" rel="noreferrer" className="block">
      <div
        className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          setOrigin(`${x}% ${y}%`);
        }}
        onMouseLeave={() => setOrigin(null)}
      >
        {/* Signed URLs are short-lived — next/image optimization would cache/expire them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-72 w-full cursor-zoom-in object-contain transition-transform duration-100 ease-out"
          style={
            origin
              ? { transformOrigin: origin, transform: `scale(${ZOOM})` }
              : undefined
          }
        />
      </div>
    </a>
  );
}

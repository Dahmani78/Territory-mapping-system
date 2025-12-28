"use client";

import dynamic from "next/dynamic";

const TerritoryMap = dynamic(() => import("./TerritoryMap"), {
  ssr: false
});

export default function MapClient() {
  return <TerritoryMap />;
}

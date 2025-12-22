"use client";

import dynamic from "next/dynamic";

const FloorPlanMeasure = dynamic(() => import("@/components/BuildingMeasure2"), {
  ssr: false,
});

export default function Home() {
  return (
    <main>
      <FloorPlanMeasure />
    </main>
  );
}

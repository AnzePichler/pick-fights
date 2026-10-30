"use client";

import Image from "next/image";
import { useState } from "react";
import type { FantasyFighter } from "@/lib/fantasy";

export default function FighterPortrait({ fighter }: { fighter: FantasyFighter }) {
  const [failed, setFailed] = useState(false);
  if (fighter.imageUrl && !failed) {
    return <Image src={fighter.imageUrl} alt="" width={260} height={400} unoptimized draggable={false} onError={() => setFailed(true)} />;
  }
  return <svg viewBox="0 0 180 240" fill="currentColor" aria-hidden="true">
    <circle cx="90" cy="53" r="32" />
    <path d="M53 96Q90 82 127 96L153 139 166 225H14l13-86 26-43Z" />
  </svg>;
}

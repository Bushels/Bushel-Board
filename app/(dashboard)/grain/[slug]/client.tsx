"use client";

import { ReactNode } from "react";
import { PageTransition } from "@/components/motion/page-transition";

export function GrainPageTransition({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}

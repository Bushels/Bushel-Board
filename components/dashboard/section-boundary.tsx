"use client";

import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { SectionStateCard } from "@/components/dashboard/section-state-card";

interface SectionBoundaryProps {
  title: string;
  message: string;
  children: ReactNode;
}

export function SectionBoundary({
  title,
  message,
  children,
}: SectionBoundaryProps) {
  return (
    <ErrorBoundary fallback={<SectionStateCard title={title} message={message} />}>
      {children}
    </ErrorBoundary>
  );
}

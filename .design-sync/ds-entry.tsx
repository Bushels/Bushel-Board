// design-sync bundle entry — re-exports ONLY the presentational components
// scoped into the Claude Design system. Passed to package-build via --entry so
// the bundle never pulls in server/data-coupled app components.
//
// `export *` exposes every named export (incl. compound sub-parts like
// CardHeader / TableRow / SelectTrigger) so preview cards can compose them;
// the curated card LIST is controlled separately by cfg.componentSrcMap.

// Core primitives
export * from "@/components/ui/button";
export * from "@/components/ui/badge";
export * from "@/components/ui/card";
export * from "@/components/ui/input";
export * from "@/components/ui/label";
export * from "@/components/ui/separator";
export * from "@/components/ui/skeleton";
export * from "@/components/ui/progress";
export * from "@/components/ui/avatar";
export * from "@/components/ui/table";

// Surfaces / brand
export * from "@/components/ui/glass-card";
export * from "@/components/ui/glass-tooltip";
export * from "@/components/ui/action-badge";
export * from "@/components/ui/market-stance-badge";
export * from "@/components/ui/grain-icon";
export * from "@/components/dashboard/section-header";
export * from "@/components/dashboard/logistics-stat-pill";

// Overlays
export * from "@/components/ui/dropdown-menu";
export * from "@/components/ui/popover";
export * from "@/components/ui/select";
export * from "@/components/ui/sheet";

// Decorative
export * from "@/components/ui/grain-particles";
export * from "@/components/ui/prairie-scene";

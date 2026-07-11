import { Badge } from "bushel-board-app";

export const Default = () => <Badge>Wheat</Badge>;

export const Variants = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <Badge>Default</Badge>
    <Badge variant="secondary">Secondary</Badge>
    <Badge variant="outline">Outline</Badge>
    <Badge variant="destructive">Stale</Badge>
    <Badge variant="ghost">Ghost</Badge>
  </div>
);

export const InContext = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
    <Badge variant="secondary">Canola</Badge>
    <Badge>Week 31</Badge>
    <Badge variant="outline">AB · SK · MB</Badge>
  </div>
);

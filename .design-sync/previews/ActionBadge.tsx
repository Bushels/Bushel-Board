import { ActionBadge } from "bushel-board-app";

export const Actions = () => (
  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
    <ActionBadge action="haul" />
    <ActionBadge action="hold" />
    <ActionBadge action="price" />
    <ActionBadge action="watch" />
  </div>
);

export const Small = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <ActionBadge action="haul" size="sm" />
    <ActionBadge action="hold" size="sm" />
    <ActionBadge action="price" size="sm" />
    <ActionBadge action="watch" size="sm" />
  </div>
);

export const InContext = () => (
  <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
    <span style={{ fontSize: 15, fontWeight: 600 }}>Canola · Week 31</span>
    <ActionBadge action="hold" size="sm" />
    <span style={{ fontSize: 13, opacity: 0.7 }}>deliveries running ahead of pace</span>
  </div>
);

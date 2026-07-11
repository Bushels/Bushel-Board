import { MarketStanceBadge } from "bushel-board-app";

export const Stances = () => (
  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
    <MarketStanceBadge stance="bullish" />
    <MarketStanceBadge stance="bearish" />
    <MarketStanceBadge stance="neutral" />
  </div>
);

export const Small = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <MarketStanceBadge stance="bullish" size="sm" />
    <MarketStanceBadge stance="bearish" size="sm" />
    <MarketStanceBadge stance="neutral" size="sm" />
  </div>
);

import { Separator } from "bushel-board-app";

export const Horizontal = () => (
  <div style={{ width: 320 }}>
    <div style={{ fontSize: 14, fontWeight: 600 }}>Canola delivery pace</div>
    <Separator />
    <div style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 8 }}>
      Week 31 · AB · SK · MB
    </div>
  </div>
);

export const Vertical = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 12, height: 24 }}>
    <span style={{ fontSize: 13 }}>Wheat</span>
    <Separator orientation="vertical" />
    <span style={{ fontSize: 13 }}>Barley</span>
    <Separator orientation="vertical" />
    <span style={{ fontSize: 13 }}>Oats</span>
  </div>
);

export const InMenu = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 240 }}>
    <span style={{ fontSize: 13 }}>Deliveries</span>
    <span style={{ fontSize: 13 }}>Terminal flow</span>
    <Separator />
    <span style={{ fontSize: 13 }}>Still in bins</span>
    <span style={{ fontSize: 13 }}>Export pace</span>
  </div>
);

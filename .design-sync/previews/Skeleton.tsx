import { Skeleton } from "bushel-board-app";

export const Line = () => <Skeleton style={{ height: 16, width: 200 }} />;

export const Shapes = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
    <Skeleton style={{ height: 48, width: 48, borderRadius: "9999px" }} />
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Skeleton style={{ height: 14, width: 160 }} />
      <Skeleton style={{ height: 14, width: 110 }} />
    </div>
    <Skeleton style={{ height: 88, width: 200, borderRadius: 12 }} />
  </div>
);

export const CardLoading = () => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 12,
      width: 300,
      padding: 16,
      border: "1px solid var(--border)",
      borderRadius: 14,
    }}
  >
    <Skeleton style={{ height: 18, width: 140 }} />
    <Skeleton style={{ height: 36, width: 100 }} />
    <Skeleton style={{ height: 12, width: 220 }} />
    <Skeleton style={{ height: 12, width: 180 }} />
  </div>
);

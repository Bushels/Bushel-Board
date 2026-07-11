import { Progress } from "bushel-board-app";

export const Default = () => (
  <div style={{ width: 320 }}>
    <Progress value={62} />
  </div>
);

export const Levels = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 320 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        Canola contracted · 28%
      </span>
      <Progress value={28} />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        Wheat delivery pace · 62%
      </span>
      <Progress value={62} />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
        Barley export target · 100%
      </span>
      <Progress value={100} />
    </div>
  </div>
);

export const Empty = () => (
  <div style={{ width: 320 }}>
    <Progress value={0} />
  </div>
);

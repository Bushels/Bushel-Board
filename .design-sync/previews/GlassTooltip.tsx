import { GlassTooltip } from "bushel-board-app";

const tintWrap: React.CSSProperties = {
  background: "linear-gradient(135deg,#ebe7dc,#f5f3ee)",
  padding: 28,
  borderRadius: 16,
  display: "inline-block",
};

export const Default = () => (
  <div style={tintWrap}>
    <GlassTooltip
      active
      label="Week 31"
      payload={[
        { color: "#c17f24", name: "Canola", value: "312.4 Kt" },
        { color: "#437a22", name: "Wheat", value: "198.1 Kt" },
      ]}
    />
  </div>
);

export const TerminalFlow = () => (
  <div style={tintWrap}>
    <GlassTooltip
      active
      label="Vancouver · Week 31"
      payload={[
        { color: "#437a22", name: "Receipts", value: "164.3 Kt" },
        { color: "#d97706", name: "Exports", value: "112.1 Kt" },
        { color: "#2e6b9e", name: "Net flow", value: "+52.2 Kt" },
      ]}
    />
  </div>
);

export const SingleSeries = () => (
  <div style={tintWrap}>
    <GlassTooltip
      active
      label="Canola delivery pace"
      payload={[{ color: "#c17f24", name: "vs 5-yr avg", value: "+8.2%" }]}
    />
  </div>
);

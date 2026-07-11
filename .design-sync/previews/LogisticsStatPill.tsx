import { LogisticsStatPill } from "bushel-board-app";

const row: React.CSSProperties = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  alignItems: "stretch",
};

export const Sentiments = () => (
  <div style={row}>
    <LogisticsStatPill
      label="Terminal throughput"
      value="164.3"
      unit="Kt"
      sentiment="positive"
      sublabel="Vancouver · +12% WoW"
    />
    <LogisticsStatPill
      label="Out-of-car time"
      value="9.4"
      unit="hrs"
      sentiment="negative"
      sublabel="Rail · above target"
    />
    <LogisticsStatPill
      label="Vessels waiting"
      value={7}
      sentiment="neutral"
      sublabel="Pacific anchorage"
    />
  </div>
);

export const NoSublabel = () => (
  <div style={row}>
    <LogisticsStatPill label="Receipts" value="164.3" unit="Kt" sentiment="positive" />
    <LogisticsStatPill label="Exports" value="112.1" unit="Kt" sentiment="neutral" />
    <LogisticsStatPill label="Net flow" value="+52.2" unit="Kt" sentiment="positive" />
  </div>
);

export const SinglePill = () => (
  <div style={{ width: 200 }}>
    <LogisticsStatPill
      label="Producer cars"
      value={1240}
      unit="cars"
      sentiment="positive"
      sublabel="Week 31 allocation · SK"
    />
  </div>
);

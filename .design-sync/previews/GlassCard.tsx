import { GlassCard } from "bushel-board-app";

const tintWrap: React.CSSProperties = {
  background: "linear-gradient(135deg,#ebe7dc,#f5f3ee)",
  padding: 28,
  borderRadius: 16,
};

export const Default = () => (
  <div style={tintWrap}>
    <GlassCard elevation={2}>
      <div style={{ padding: 20, width: 280 }}>
        <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.7 }}>
          Still in bins
        </p>
        <div
          className="tabular-nums"
          style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1, marginTop: 6 }}
        >
          4.1 Mt
        </div>
        <p style={{ fontSize: 13, marginTop: 4, opacity: 0.7 }}>Canola · prairie farm-held</p>
      </div>
    </GlassCard>
  </div>
);

export const Elevations = () => (
  <div style={{ ...tintWrap, display: "flex", gap: 20, flexWrap: "wrap" }}>
    {([1, 2, 3] as const).map((e) => (
      <GlassCard key={e} elevation={e} hover={false}>
        <div style={{ padding: 18, width: 150 }}>
          <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.7 }}>
            Elevation {e}
          </p>
          <div className="tabular-nums" style={{ fontSize: 24, fontWeight: 700, marginTop: 6 }}>
            {[198.1, 312.4, 74.6][e - 1]} Kt
          </div>
          <p style={{ fontSize: 12, marginTop: 2, opacity: 0.7 }}>
            {["Wheat", "Canola", "Barley"][e - 1]}
          </p>
        </div>
      </GlassCard>
    ))}
  </div>
);

export const GlowVariants = () => (
  <div style={{ ...tintWrap, display: "flex", gap: 20, flexWrap: "wrap" }}>
    <GlassCard elevation={2} glow="canola" hover={false}>
      <div style={{ padding: 18, width: 170 }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.7 }}>
          Delivery pace
        </p>
        <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
          +8.2%
        </div>
        <p style={{ fontSize: 12, marginTop: 2, opacity: 0.7 }}>Canola glow · ahead of avg</p>
      </div>
    </GlassCard>
    <GlassCard elevation={2} glow="prairie" hover={false}>
      <div style={{ padding: 18, width: 170 }}>
        <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.7 }}>
          Terminal flow
        </p>
        <div className="tabular-nums" style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>
          Net +52 Kt
        </div>
        <p style={{ fontSize: 12, marginTop: 2, opacity: 0.7 }}>Prairie glow · Week 31</p>
      </div>
    </GlassCard>
  </div>
);

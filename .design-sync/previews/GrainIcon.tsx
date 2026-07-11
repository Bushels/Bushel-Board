import { GrainIcon } from "bushel-board-app";

const cell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  width: 72,
};

const caption: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 1,
  opacity: 0.7,
};

export const Grains = () => (
  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", color: "#c17f24" }}>
    {[
      ["canola", "Canola"],
      ["wheat", "Wheat"],
      ["barley", "Barley"],
      ["oats", "Oats"],
      ["peas", "Peas"],
      ["flaxseed", "Flax"],
    ].map(([grain, name]) => (
      <div key={grain} style={cell}>
        <GrainIcon grain={grain} size={36} />
        <span style={caption}>{name}</span>
      </div>
    ))}
  </div>
);

export const MoreGrains = () => (
  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", color: "#437a22" }}>
    {[
      ["amber-durum", "Durum"],
      ["soybeans", "Soybeans"],
      ["corn", "Corn"],
      ["rye", "Rye"],
      ["mustard-seed", "Mustard"],
      ["canaryseed", "Canary"],
      ["sunflower", "Sunflower"],
      ["lentils", "Lentils"],
    ].map(([grain, name]) => (
      <div key={grain} style={cell}>
        <GrainIcon grain={grain} size={36} />
        <span style={caption}>{name}</span>
      </div>
    ))}
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 24, alignItems: "flex-end", color: "#2a261e" }}>
    {[20, 28, 40, 56].map((size) => (
      <div key={size} style={cell}>
        <GrainIcon grain="canola" size={size} />
        <span style={caption}>{size}px</span>
      </div>
    ))}
  </div>
);

export const InlineWithLabel = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, color: "#c17f24" }}>
      <GrainIcon grain="canola" size={22} /> Canola — Week 31
    </span>
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, color: "#437a22" }}>
      <GrainIcon grain="wheat" size={22} /> Wheat — Week 31
    </span>
  </div>
);

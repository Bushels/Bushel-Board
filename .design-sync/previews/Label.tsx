import { Label, Input } from "bushel-board-app";

export const Default = () => <Label htmlFor="grain">Grain type</Label>;

export const WithInput = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 280 }}>
    <Label htmlFor="tonnes-field">Tonnes in the bin</Label>
    <Input id="tonnes-field" placeholder="e.g. 312 t of Canola" />
  </div>
);

export const Stacked = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 280 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label htmlFor="acres-field">Acres seeded — AB</Label>
      <Input id="acres-field" type="number" placeholder="1,280" />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label htmlFor="region-field">Delivery region</Label>
      <Input id="region-field" placeholder="SK · MB" />
    </div>
  </div>
);

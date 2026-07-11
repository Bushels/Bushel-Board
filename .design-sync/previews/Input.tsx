import { Input } from "bushel-board-app";

export const Default = () => (
  <div style={{ width: 280 }}>
    <Input placeholder="Tonnes delivered this week" />
  </div>
);

export const WithValue = () => (
  <div style={{ width: 280 }}>
    <Input defaultValue="312.4" />
  </div>
);

export const Types = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 280 }}>
    <Input type="text" placeholder="Canola — bin label" />
    <Input type="number" placeholder="Acres seeded (SK)" />
    <Input type="search" placeholder="Search grains…" />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 280 }}>
    <Input disabled placeholder="Locked — Week 31 closed" />
  </div>
);

export const Invalid = () => (
  <div style={{ width: 280 }}>
    <Input aria-invalid defaultValue="-40 bushels" />
  </div>
);

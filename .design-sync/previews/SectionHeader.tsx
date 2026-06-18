import { SectionHeader, Badge, Button } from "bushel-board-app";

export const WithSubtitle = () => (
  <div style={{ width: 520 }}>
    <SectionHeader
      title="Market Thesis"
      subtitle="Where Canola is heading this week, in plain terms."
    />
  </div>
);

export const TitleOnly = () => (
  <div style={{ width: 520 }}>
    <SectionHeader title="Grain in your bin" />
  </div>
);

export const WithAction = () => (
  <div style={{ width: 520 }}>
    <SectionHeader
      title="Your Grains"
      subtitle="Primary deliveries · AB · SK · MB · Week 31"
    >
      <Badge variant="secondary">Bullish</Badge>
      <Button size="sm" variant="outline">
        Add grain
      </Button>
    </SectionHeader>
  </div>
);

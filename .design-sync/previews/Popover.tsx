import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  Button,
} from "bushel-board-app";

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
  padding: "4px 0",
};

export const Open = () => (
  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          Week 31 breakdown
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" style={{ width: 260 }}>
        <PopoverHeader>
          <PopoverTitle>Canola deliveries · Week 31</PopoverTitle>
          <PopoverDescription>Primary elevator receipts, SK</PopoverDescription>
        </PopoverHeader>
        <div style={{ marginTop: 12 }}>
          <div style={row}>
            <span className="text-muted-foreground">This week</span>
            <span className="tabular-nums" style={{ fontWeight: 600 }}>
              312.4 Kt
            </span>
          </div>
          <div style={row}>
            <span className="text-muted-foreground">5-yr average</span>
            <span className="tabular-nums">288.7 Kt</span>
          </div>
          <div style={row}>
            <span className="text-muted-foreground">YoY gap</span>
            <span className="tabular-nums" style={{ color: "var(--prairie, #437a22)", fontWeight: 600 }}>
              +8.2%
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </div>
);

export const Closed = () => (
  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          Week 31 breakdown
        </Button>
      </PopoverTrigger>
    </Popover>
  </div>
);

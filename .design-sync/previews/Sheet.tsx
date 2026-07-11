import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
} from "bushel-board-app";

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
  padding: "6px 0",
  borderBottom: "1px solid var(--border, #e5e1d8)",
};

export const Open = () => (
  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
    <Sheet defaultOpen>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Log a delivery
        </Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Log canola delivery</SheetTitle>
          <SheetDescription>
            Hauled to terminal · Saskatchewan · Week 31
          </SheetDescription>
        </SheetHeader>
        <div style={{ padding: "0 16px" }}>
          <div style={row}>
            <span className="text-muted-foreground">Grade</span>
            <span style={{ fontWeight: 600 }}>No. 1 Canada</span>
          </div>
          <div style={row}>
            <span className="text-muted-foreground">Tonnes</span>
            <span className="tabular-nums" style={{ fontWeight: 600 }}>
              42.6 t
            </span>
          </div>
          <div style={{ ...row, borderBottom: "none" }}>
            <span className="text-muted-foreground">Still in bin</span>
            <span className="tabular-nums">318 t</span>
          </div>
        </div>
        <SheetFooter>
          <Button size="sm">Save delivery</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </div>
);

export const Closed = () => (
  <div style={{ display: "flex", justifyContent: "center", paddingTop: 8 }}>
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          Log a delivery
        </Button>
      </SheetTrigger>
    </Sheet>
  </div>
);

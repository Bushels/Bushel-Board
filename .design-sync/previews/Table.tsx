import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  TableCaption,
  TableFooter,
} from "bushel-board-app";

export const GrainStats = () => (
  <div style={{ width: 460 }}>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Grain</TableHead>
          <TableHead style={{ textAlign: "right" }}>Deliveries Kt</TableHead>
          <TableHead style={{ textAlign: "right" }}>Stance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell style={{ fontWeight: 600 }}>Canola</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>312.4</TableCell>
          <TableCell style={{ textAlign: "right" }}>Bullish</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 600 }}>Wheat</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>198.1</TableCell>
          <TableCell style={{ textAlign: "right" }}>Neutral</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 600 }}>Barley</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>74.6</TableCell>
          <TableCell style={{ textAlign: "right" }}>Bearish</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 600 }}>Oats</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>41.2</TableCell>
          <TableCell style={{ textAlign: "right" }}>Bullish</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
);

export const WithFooter = () => (
  <div style={{ width: 460 }}>
    <Table>
      <TableCaption>Primary deliveries · AB · SK · MB · Week 31</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Province</TableHead>
          <TableHead style={{ textAlign: "right" }}>Canola Kt</TableHead>
          <TableHead style={{ textAlign: "right" }}>Wheat Kt</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell style={{ fontWeight: 600 }}>Alberta</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>118.7</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>72.4</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 600 }}>Saskatchewan</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>151.9</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>89.3</TableCell>
        </TableRow>
        <TableRow>
          <TableCell style={{ fontWeight: 600 }}>Manitoba</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>41.8</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>36.4</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell style={{ fontWeight: 700 }}>Prairie total</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>312.4</TableCell>
          <TableCell style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>198.1</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  </div>
);

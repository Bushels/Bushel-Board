import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  Badge,
  Button,
} from "bushel-board-app";

export const MarketStat = () => (
  <Card style={{ width: 340 }}>
    <CardHeader>
      <CardTitle>Canola — Week 31</CardTitle>
      <CardDescription>Primary deliveries · AB · SK · MB</CardDescription>
      <CardAction>
        <Badge variant="secondary">Bullish</Badge>
      </CardAction>
    </CardHeader>
    <CardContent>
      <div className="tabular-nums" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>
        312.4 Kt
      </div>
      <p className="text-muted-foreground" style={{ fontSize: 13, marginTop: 6 }}>
        +8.2% vs 5-year average
      </p>
    </CardContent>
    <CardFooter>
      <Button size="sm" variant="outline">
        Open grain detail
      </Button>
    </CardFooter>
  </Card>
);

export const Simple = () => (
  <Card style={{ width: 300 }}>
    <CardHeader>
      <CardTitle>Still in bins</CardTitle>
      <CardDescription>Estimated farm-held stocks</CardDescription>
    </CardHeader>
    <CardContent className="tabular-nums" style={{ fontSize: 24, fontWeight: 600 }}>
      4.1 Mt
    </CardContent>
  </Card>
);

---
category: Surfaces
---

Container for a single unit of content on the wheat-themed `bg-card` surface
(rounded corners, subtle shadow). Compose with `CardHeader` + `CardTitle` +
`CardDescription`, an optional `CardAction` (top-right slot), `CardContent`,
and `CardFooter`. Pair numeric values with `tabular-nums` for aligned figures.

## Examples

```tsx
<Card>
  <CardHeader>
    <CardTitle>Canola — Week 31</CardTitle>
    <CardDescription>Primary deliveries</CardDescription>
    <CardAction><Badge variant="secondary">Bullish</Badge></CardAction>
  </CardHeader>
  <CardContent>312.4 Kt</CardContent>
  <CardFooter><Button size="sm" variant="outline">Open</Button></CardFooter>
</Card>
```

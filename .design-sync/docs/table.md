---
category: Surfaces
---

Data table primitives. Compose `Table` > `TableHeader`/`TableBody` >
`TableRow` > `TableHead`/`TableCell`, with optional `TableCaption` and
`TableFooter`. Use `tabular-nums` on numeric cells for aligned figures.

## Examples

```tsx
<Table>
  <TableHeader><TableRow><TableHead>Grain</TableHead><TableHead>Kt</TableHead></TableRow></TableHeader>
  <TableBody><TableRow><TableCell>Canola</TableCell><TableCell>312.4</TableCell></TableRow></TableBody>
</Table>
```

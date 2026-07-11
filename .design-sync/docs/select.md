---
category: Overlays
---

Radix select. Compose `Select` > `SelectTrigger` > `SelectValue`, and
`SelectContent` with `SelectItem` (and optional `SelectGroup`/`SelectLabel`).

## Examples

```tsx
<Select>
  <SelectTrigger><SelectValue placeholder="Choose grain" /></SelectTrigger>
  <SelectContent>
    <SelectItem value="canola">Canola</SelectItem>
    <SelectItem value="wheat">Wheat</SelectItem>
  </SelectContent>
</Select>
```

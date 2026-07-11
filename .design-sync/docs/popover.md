---
category: Overlays
---

Radix popover — floating panel anchored to a trigger. Compose `Popover` >
`PopoverTrigger` (use `asChild`) > `PopoverContent`.

## Examples

```tsx
<Popover>
  <PopoverTrigger asChild><Button variant="outline">Details</Button></PopoverTrigger>
  <PopoverContent>Week 31 delivery breakdown.</PopoverContent>
</Popover>
```

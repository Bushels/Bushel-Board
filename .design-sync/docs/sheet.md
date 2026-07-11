---
category: Overlays
---

Slide-in panel (Radix Dialog). Compose `Sheet` > `SheetTrigger` (use `asChild`)
> `SheetContent` (with `side="right|left|top|bottom"`), `SheetHeader`,
`SheetTitle`, `SheetDescription`.

## Examples

```tsx
<Sheet>
  <SheetTrigger asChild><Button>Open</Button></SheetTrigger>
  <SheetContent side="right">
    <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
  </SheetContent>
</Sheet>
```

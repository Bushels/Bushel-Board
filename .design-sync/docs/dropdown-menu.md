---
category: Overlays
---

Radix dropdown menu. Compose `DropdownMenu` > `DropdownMenuTrigger` (use
`asChild`) > `DropdownMenuContent` with `DropdownMenuItem`,
`DropdownMenuCheckboxItem`, `DropdownMenuSeparator`, and `DropdownMenuLabel`.

## Examples

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild><Button variant="outline">Grain</Button></DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Canola</DropdownMenuItem>
    <DropdownMenuItem>Wheat</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

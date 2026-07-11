---
category: Primitives
---

Compact status or label pill. Use `variant` to signal meaning — `secondary`
for neutral tags (grain names, regions), `outline` for metadata, `destructive`
for warnings such as stale data, `ghost` for the lowest-emphasis label. Set
`asChild` to wrap a link.

## Examples

```tsx
<Badge variant="secondary">Canola</Badge>
<Badge>Week 31</Badge>
<Badge variant="destructive">Stale</Badge>
```

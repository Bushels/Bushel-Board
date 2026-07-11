---
category: Primitives
---

Circular avatar. Compose `AvatarImage` (with `src`/`alt`) and `AvatarFallback`
(initials shown while the image loads or when it is absent).

## Examples

```tsx
<Avatar>
  <AvatarImage src="/grower.jpg" alt="Grower" />
  <AvatarFallback>KB</AvatarFallback>
</Avatar>
```

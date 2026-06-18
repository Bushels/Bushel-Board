---
category: Surfaces
---

Glassmorphism container — translucent blurred surface with elevation and an
optional brand glow. Props: `elevation` (1–3), `glow` (`canola`/`prairie`/
`none`), `hover`. Animates in with framer-motion (respects reduced motion).

## Examples

```tsx
<GlassCard elevation={2} glow="canola">
  <div className="p-5">Market stance</div>
</GlassCard>
```

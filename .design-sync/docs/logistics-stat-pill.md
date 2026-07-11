---
category: Brand
---

Compact stat pill with sentiment-colored border + value — `positive`
(prairie), `negative` (red), `neutral` (amber). Shows a big `value` (+ optional
`unit`), an uppercase `label`, and an optional `sublabel`.

## Examples

```tsx
<LogisticsStatPill label="Vessels waiting" value={14} sentiment="negative" />
<LogisticsStatPill label="Out-of-car time" value="3.2" unit="hrs" sentiment="positive" />
```

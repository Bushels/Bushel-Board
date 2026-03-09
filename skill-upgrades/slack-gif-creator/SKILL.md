---
name: slack-gif-creator
description: "Create animated GIFs optimized for Slack — emoji reactions, message animations, and custom stickers. Use when the user says: 'make a GIF', 'Slack emoji', 'animated emoji', 'GIF for Slack', 'make me a GIF of X doing Y', 'custom Slack reaction', 'animated sticker', or asks for any animated GIF intended for messaging platforms. Also trigger for 'bouncing text GIF', 'spinning logo GIF', or 'celebration animation'. Do NOT use for static images or posters (use canvas-design), video editing, screen recordings, generative art (use algorithmic-art), or GIFs that don't need Slack optimization."
license: Complete terms in LICENSE.txt
---

# Slack GIF Creator

A toolkit providing utilities and knowledge for creating animated GIFs optimized for Slack. Provides core utilities (GIFBuilder, validators, easing functions) and animation patterns.

## Slack Requirements

| Type | Dimensions | FPS | Colors | Duration |
|------|-----------|-----|--------|----------|
| Emoji GIF | 128x128 | 10-30 | 48-128 | Under 3 sec |
| Message GIF | 480x480 | 10-30 | 48-128 | Flexible |

Lower FPS and fewer colors = smaller file size. Emoji GIFs should be tight loops.

## Core Workflow

```python
from core.gif_builder import GIFBuilder
from PIL import Image, ImageDraw

# 1. Create builder
builder = GIFBuilder(width=128, height=128, fps=10)

# 2. Generate frames
for i in range(12):
    frame = Image.new('RGB', (128, 128), (240, 248, 255))
    draw = ImageDraw.Draw(frame)
    # Draw your animation using PIL primitives
    builder.add_frame(frame)

# 3. Save with optimization
builder.save('output.gif', num_colors=48, optimize_for_emoji=True)
```

## Drawing Graphics

### User-Uploaded Images
If a user uploads an image, determine intent: **use directly** ("animate this") vs. **use as inspiration** ("make something like this"). Load with `Image.open('file.png')`.

### Drawing from Scratch
Use PIL ImageDraw primitives: `ellipse`, `polygon`, `line`, `rectangle`. Always set `width=2` or higher for outlines — thin lines look choppy.

### Making Graphics Look Good
- **Visual depth**: Use gradients for backgrounds (`create_gradient_background`), layer shapes
- **Interesting shapes**: Add highlights, rings, patterns — don't just draw plain circles
- **Color**: Vibrant, complementary colors with strong contrast
- **Complex shapes** (hearts, snowflakes): Combine polygons and ellipses, calculate points for symmetry

**Don't use**: Emoji fonts (unreliable), or assume pre-packaged graphics exist.

## Available Utilities

### GIFBuilder (`core.gif_builder`)
```python
builder = GIFBuilder(width=128, height=128, fps=10)
builder.add_frame(frame)       # Add PIL Image
builder.add_frames(frames)     # Add list of frames
builder.save('out.gif', num_colors=48, optimize_for_emoji=True, remove_duplicates=True)
```

### Validators (`core.validators`)
```python
from core.validators import validate_gif, is_slack_ready
passes, info = validate_gif('my.gif', is_emoji=True, verbose=True)
if is_slack_ready('my.gif'): print("Ready!")
```

### Easing Functions (`core.easing`)
```python
from core.easing import interpolate
t = i / (num_frames - 1)  # 0.0 to 1.0
y = interpolate(start=0, end=400, t=t, easing='ease_out')
# Available: linear, ease_in, ease_out, ease_in_out, bounce_out, elastic_out, back_out
```

### Frame Helpers (`core.frame_composer`)
```python
from core.frame_composer import (
    create_blank_frame, create_gradient_background,
    draw_circle, draw_text, draw_star
)
```

## Animation Concepts

| Concept | Technique | Key function |
|---------|-----------|-------------|
| Shake/Vibrate | sin/cos offset on position | `math.sin(frame * freq)` |
| Pulse/Heartbeat | Scale size rhythmically | `sin(t * freq * 2π)`, scale 0.8-1.2 |
| Bounce | Fall + bounce on landing | `interpolate(easing='bounce_out')` |
| Spin/Rotate | Rotate around center | `image.rotate(angle, resample=BICUBIC)` |
| Fade In/Out | Alpha channel adjustment | `Image.blend(img1, img2, alpha)` |
| Slide | Move from off-screen to position | `interpolate(easing='ease_out')` |
| Explode | Particles radiating outward | Random angles + velocities + gravity |

Combine concepts for richer animations: bouncing + rotating, pulsing + sliding, etc.

## Examples

**Example 1: Celebration emoji**
User says: "Make a party popper emoji GIF for Slack"
→ 128x128, 10 FPS, 12 frames. Draw a cone shape, then animate confetti particles bursting outward using explode pattern. Validate with `is_slack_ready()`. Use vibrant colors, thick outlines.

**Example 2: Thumbs up reaction**
User says: "Animated thumbs up for our Slack"
→ 128x128, 10 FPS. Draw a hand with thumb up using polygons. Animate with a pulse (scale 0.9-1.1) and subtle bounce. Keep under 48 colors for small file size.

**Example 3: Loading spinner**
User says: "Make a Slack loading animation"
→ 128x128, 20 FPS. Draw arc segments, animate rotation using frame-based angle increment. Smooth easing with `ease_in_out`. Gradient background for polish.

## Common Issues

- **GIF too large for Slack**: Reduce colors to 48, lower FPS to 10, use `optimize_for_emoji=True`, enable `remove_duplicates=True`. For message GIFs, try 480→320px.
- **Animation looks choppy**: Increase frame count or use easing functions instead of linear interpolation. `ease_out` and `ease_in_out` look much smoother.
- **Colors look washed out**: GIF format is limited to 256 colors max. Use fewer, more saturated colors rather than subtle gradients that get quantized.
- **Emoji font characters missing**: Don't use emoji Unicode characters — they render differently per platform. Draw shapes with PIL primitives instead.
- **Validation fails**: Run `validate_gif('file.gif', is_emoji=True, verbose=True)` to see exactly which requirements are unmet (dimensions, file size, frame count).

## Dependencies

```bash
pip install pillow imageio numpy
```

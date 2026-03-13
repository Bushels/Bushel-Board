interface HillsConfig {
  isDark: boolean;
}

export function drawHills(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizonY: number,
  mouseOffsetX: number,
  config: HillsConfig
) {
  const hills = [
    {
      color: config.isDark ? "rgba(25, 25, 40, 0.9)" : "rgba(120, 100, 70, 0.3)",
      yOffset: 0,
      parallax: 0.005,
      amplitude: h * 0.04,
      frequency: 0.0015,
    },
    {
      color: config.isDark ? "rgba(30, 28, 35, 0.85)" : "rgba(140, 115, 75, 0.35)",
      yOffset: h * 0.015,
      parallax: 0.01,
      amplitude: h * 0.035,
      frequency: 0.002,
    },
    {
      color: config.isDark ? "rgba(35, 32, 28, 0.8)" : "rgba(160, 135, 85, 0.4)",
      yOffset: h * 0.03,
      parallax: 0.02,
      amplitude: h * 0.03,
      frequency: 0.003,
    },
  ];

  for (const hill of hills) {
    const px = mouseOffsetX * hill.parallax;
    ctx.fillStyle = hill.color;
    ctx.beginPath();
    ctx.moveTo(0, h);

    for (let x = 0; x <= w; x += 4) {
      const y =
        horizonY +
        hill.yOffset +
        Math.sin((x + px) * hill.frequency) * hill.amplitude +
        Math.sin((x + px) * hill.frequency * 2.3 + 1.5) * hill.amplitude * 0.4;
      ctx.lineTo(x, y);
    }

    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

interface SkyConfig {
  isDark: boolean;
}

export function drawSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizonY: number,
  time: number,
  config: SkyConfig
) {
  // Sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  if (config.isDark) {
    skyGrad.addColorStop(0, "#0f1133");
    skyGrad.addColorStop(0.5, "#1a1a3e");
    skyGrad.addColorStop(0.85, "#4a2040");
    skyGrad.addColorStop(1, "#c2570a");
  } else {
    skyGrad.addColorStop(0, "#5b8cb8");
    skyGrad.addColorStop(0.4, "#d4a574");
    skyGrad.addColorStop(0.75, "#e8a84c");
    skyGrad.addColorStop(1, "#d4781e");
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, horizonY + 20);

  // Sun disc
  const sunX = w * 0.65;
  const sunY = horizonY - h * 0.02;
  const sunRadius = Math.min(w, h) * 0.06;

  // Sun glow
  const glowRadius = sunRadius * 4;
  const glow = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.3, sunX, sunY, glowRadius);
  if (config.isDark) {
    glow.addColorStop(0, "rgba(210, 120, 40, 0.6)");
    glow.addColorStop(0.3, "rgba(210, 100, 20, 0.2)");
    glow.addColorStop(1, "rgba(210, 80, 10, 0)");
  } else {
    glow.addColorStop(0, "rgba(255, 220, 120, 0.8)");
    glow.addColorStop(0.3, "rgba(255, 200, 80, 0.3)");
    glow.addColorStop(1, "rgba(255, 180, 60, 0)");
  }
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - glowRadius, sunY - glowRadius, glowRadius * 2, glowRadius * 2);

  // Sun disc
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
  if (config.isDark) {
    sunGrad.addColorStop(0, "#e8931e");
    sunGrad.addColorStop(0.7, "#d4781e");
    sunGrad.addColorStop(1, "rgba(200, 100, 20, 0.2)");
  } else {
    sunGrad.addColorStop(0, "#fff5d4");
    sunGrad.addColorStop(0.5, "#ffe088");
    sunGrad.addColorStop(1, "rgba(255, 200, 80, 0.1)");
  }
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
  ctx.fill();

  // Cloud wisps
  drawClouds(ctx, w, horizonY, time, config);
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizonY: number,
  time: number,
  config: SkyConfig
) {
  const cloudColor = config.isDark
    ? "rgba(80, 60, 100, 0.15)"
    : "rgba(255, 240, 220, 0.25)";

  ctx.fillStyle = cloudColor;

  const clouds = [
    { baseX: w * 0.2, y: horizonY * 0.2, rx: 80, ry: 12, speed: 0.008 },
    { baseX: w * 0.6, y: horizonY * 0.35, rx: 100, ry: 10, speed: 0.005 },
    { baseX: w * 0.85, y: horizonY * 0.15, rx: 60, ry: 8, speed: 0.01 },
  ];

  for (const c of clouds) {
    const x = ((c.baseX + time * c.speed * w) % (w + c.rx * 4)) - c.rx * 2;
    ctx.beginPath();
    ctx.ellipse(x, c.y, c.rx, c.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + c.rx * 0.4, c.y - c.ry * 0.5, c.rx * 0.6, c.ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

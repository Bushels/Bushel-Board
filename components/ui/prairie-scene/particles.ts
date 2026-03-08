const GOLD_COLORS = ["#D4A017", "#F3E5AB", "#E5C77F", "#DAA520"];

export class GrainMote {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  speedX: number;
  speedY: number;
  color: string;
  opacity: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.baseY = y;
    this.size = Math.random() * 2 + 0.5;
    this.speedX = (Math.random() - 0.5) * 0.2;
    this.speedY = (Math.random() - 0.5) * 0.15;
    this.color = GOLD_COLORS[Math.floor(Math.random() * GOLD_COLORS.length)];
    this.opacity = 0.3 + Math.random() * 0.4;
  }

  update() {
    this.x += this.speedX;
    this.y += this.speedY;
    if (Math.abs(this.x - this.baseX) > 60) this.speedX *= -1;
    if (Math.abs(this.y - this.baseY) > 40) this.speedY *= -1;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalAlpha = this.opacity;
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 6;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

export function createMotes(
  canvasW: number,
  horizonY: number,
  count: number = 40
): GrainMote[] {
  const motes: GrainMote[] = [];
  for (let i = 0; i < count; i++) {
    const x = Math.random() * canvasW;
    const y = horizonY * 0.3 + Math.random() * horizonY * 0.8;
    motes.push(new GrainMote(x, y));
  }
  return motes;
}

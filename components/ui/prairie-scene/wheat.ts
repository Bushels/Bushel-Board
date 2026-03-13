import { noise2D } from "./noise";

const WHEAT_COLORS = ["#D4A017", "#B8860B", "#F3E5AB", "#DAA520", "#C5922A"];
const WHEAT_COLORS_DARK = ["#9E7812", "#8B6914", "#C9A84E", "#A07818", "#957020"];

export class WheatStalk {
  x: number;
  baseY: number;
  height: number;
  color: string;
  colorDark: string;
  phase: number;
  headDroop: number;
  thickness: number;

  constructor(x: number, baseY: number, depth: number) {
    this.x = x;
    this.baseY = baseY;
    const depthScale = 0.5 + depth * 0.5;
    this.height = (40 + Math.random() * 50) * depthScale;
    this.thickness = (0.8 + Math.random() * 0.8) * depthScale;
    this.phase = Math.random() * 1000;
    this.headDroop = 4 + Math.random() * 6;

    const colorIdx = Math.floor(Math.random() * WHEAT_COLORS.length);
    this.color = WHEAT_COLORS[colorIdx];
    this.colorDark = WHEAT_COLORS_DARK[colorIdx];
  }

  draw(
    ctx: CanvasRenderingContext2D,
    time: number,
    gustTime: number,
    mouseX: number,
    mouseY: number,
    isDark: boolean
  ) {
    const noiseVal = noise2D(this.x * 0.005 + this.phase, time * 0.4);
    const gustWave = Math.sin(this.x * 0.003 - gustTime * 2) * 0.5 + 0.5;
    const gustStrength = Math.max(0, Math.sin(gustTime * 0.8)) * gustWave;
    const sway = noiseVal * 12 + gustStrength * 18;

    const dx = this.x - mouseX;
    const dy = this.baseY - mouseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mouseRadius = 100;
    let mousePush = 0;
    if (dist < mouseRadius && dist > 0) {
      const force = (1 - dist / mouseRadius) * 25;
      mousePush = dx > 0 ? force : -force;
    }

    const totalSway = sway + mousePush;

    const tipX = this.x + totalSway;
    const tipY = this.baseY - this.height;
    const cpX = this.x + totalSway * 0.5;
    const cpY = this.baseY - this.height * 0.6;

    ctx.strokeStyle = isDark ? this.colorDark : this.color;
    ctx.lineWidth = this.thickness;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.x, this.baseY);
    ctx.quadraticCurveTo(cpX, cpY, tipX, tipY);
    ctx.stroke();

    const headX = tipX + totalSway * 0.15;
    const headY = tipY + this.headDroop * 0.3;
    const headAngle = Math.atan2(this.headDroop, totalSway * 0.15) - Math.PI / 2;
    const headLength = 5 + this.height * 0.06;
    const headWidth = 1.5 + this.thickness * 0.5;

    ctx.fillStyle = isDark ? this.colorDark : this.color;
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(headAngle + totalSway * 0.01);
    ctx.beginPath();
    ctx.ellipse(0, 0, headWidth, headLength, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function createWheatField(
  canvasW: number,
  canvasH: number,
  horizonY: number
): WheatStalk[] {
  const stalks: WheatStalk[] = [];
  const fieldTop = horizonY + canvasH * 0.03;
  const fieldBottom = canvasH;
  const count = Math.floor(canvasW / 5);

  for (let i = 0; i < count; i++) {
    const x = Math.random() * canvasW;
    const depth = Math.random();
    const baseY = fieldTop + depth * (fieldBottom - fieldTop);
    stalks.push(new WheatStalk(x, baseY, depth));
  }

  stalks.sort((a, b) => a.baseY - b.baseY);
  return stalks;
}

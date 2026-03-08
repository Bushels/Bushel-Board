"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { drawSky } from "./sky";
import { drawHills } from "./hills";
import { WheatStalk, createWheatField } from "./wheat";
import { GrainMote, createMotes } from "./particles";

export function PrairieScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Detect dark mode
    const isDark = () => document.documentElement.classList.contains("dark");

    let animationFrameId: number;
    let stalks: WheatStalk[] = [];
    let motes: GrainMote[] = [];
    let time = 0;
    let gustTime = 0;

    const mouse = { x: -1000, y: -1000 };

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      const horizonY = canvas!.height * 0.55;
      stalks = createWheatField(canvas!.width, canvas!.height, horizonY);
      motes = createMotes(canvas!.width, horizonY, 40);
    }

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const handleMouseOut = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseout", handleMouseOut);
    window.addEventListener("resize", resize);

    resize();

    if (prefersReducedMotion) {
      // Draw a single static frame
      const horizonY = canvas.height * 0.55;
      const dark = isDark();
      drawSky(ctx, canvas.width, canvas.height, horizonY, 0, { isDark: dark });
      drawHills(ctx, canvas.width, canvas.height, horizonY, 0, {
        isDark: dark,
      });
      for (const stalk of stalks) {
        stalk.draw(ctx, 0, 0, -1000, -1000, dark);
      }
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseout", handleMouseOut);
        window.removeEventListener("resize", resize);
      };
    }

    function animate() {
      const w = canvas!.width;
      const h = canvas!.height;
      const horizonY = h * 0.55;
      const dark = isDark();

      ctx!.clearRect(0, 0, w, h);

      // Layer 1: Sky
      drawSky(ctx!, w, h, horizonY, time, { isDark: dark });

      // Layer 2: Hills (with mouse parallax)
      const mouseOffsetX = mouse.x - w / 2;
      drawHills(ctx!, w, h, horizonY, mouseOffsetX, { isDark: dark });

      // Ground fill below hills
      const groundGrad = ctx!.createLinearGradient(
        0,
        horizonY + h * 0.05,
        0,
        h
      );
      if (dark) {
        groundGrad.addColorStop(0, "#2a2218");
        groundGrad.addColorStop(1, "#1a1610");
      } else {
        groundGrad.addColorStop(0, "#c5a55a");
        groundGrad.addColorStop(1, "#a08840");
      }
      ctx!.fillStyle = groundGrad;
      ctx!.fillRect(0, horizonY + h * 0.03, w, h - horizonY);

      // Layer 3: Wheat stalks
      for (const stalk of stalks) {
        stalk.draw(ctx!, time, gustTime, mouse.x, mouse.y, dark);
      }

      // Layer 4: Floating motes
      for (const mote of motes) {
        mote.update();
        mote.draw(ctx!);
      }

      time += 0.016;
      gustTime += 0.016;

      animationFrameId = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handleMouseOut);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <motion.canvas
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5 }}
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}

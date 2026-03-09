"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

class Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  baseX: number;
  baseY: number;
  density: number;
  color: string;
  isData: boolean;

  constructor(x: number, y: number, isData: boolean) {
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.baseY = y;
    this.size = Math.random() * 2.5 + 0.5;
    this.density = (Math.random() * 30) + 1;
    this.isData = isData;
    
    // Give data nodes a cyan color, and wheat nodes a golden color
    if (this.isData) {
      const cyans = ["#00FFFF", "#20B2AA", "#48D1CC", "#E0FFFF"];
      this.color = cyans[Math.floor(Math.random() * cyans.length)];
    } else {
      const golds = ["#D4A017", "#F3E5AB", "#E5C77F", "#DAA520"];
      this.color = golds[Math.floor(Math.random() * golds.length)];
    }

    // Natural ambient floating motion
    this.speedX = (Math.random() - 0.5) * 0.3;
    this.speedY = (Math.random() - 0.5) * 0.3;
  }

  update(mouse: { x: number; y: number; radius: number }) {
    // Interactivity: React to mouse
    const dx = mouse.x - this.x;
    const dy = mouse.y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Ambient floating
    this.x += this.speedX;
    this.y += this.speedY;

    // Boundary check for ambient floating (keep them near their base position loosely)
    if (this.x < this.baseX - 50 || this.x > this.baseX + 50) this.speedX *= -1;
    if (this.y < this.baseY - 50 || this.y > this.baseY + 50) this.speedY *= -1;

    // Mouse repulsion
    const forceDirectionX = dx / distance;
    const forceDirectionY = dy / distance;
    const maxDistance = mouse.radius;
    const force = (maxDistance - distance) / maxDistance;
    const directionX = forceDirectionX * force * this.density * 0.6;
    const directionY = forceDirectionY * force * this.density * 0.6;

    if (distance < mouse.radius) {
      this.x -= directionX;
      this.y -= directionY;
    } else {
      // Return to position slowly if not perturbed
      if (this.x !== this.baseX) {
        const dxBase = this.x - this.baseX;
        this.x -= dxBase / 50;
      }
      if (this.y !== this.baseY) {
        const dyBase = this.y - this.baseY;
        this.y -= dyBase / 50;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    // Add a slight glow effect to data particles
    if (this.isData) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;
    } else {
      ctx.shadowBlur = 0;
    }
  }
}

export function GrainParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let particlesArray: Particle[] = [];

    // Size canvas to window
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const mouse = {
      x: -1000, // initialize offscreen
      y: -1000,
      radius: 120, // Interaction radius
    };

    // Mouse move event
    const handleMouseMove = (event: MouseEvent) => {
      mouse.x = event.x;
      mouse.y = event.y;
    };
    
    // Mouse out event
    const handleMouseOut = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    // Resize event
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      init(); // Reinitialize particles on resize
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseout", handleMouseOut);
    window.addEventListener("resize", handleResize);

    // initialize particles
    function init() {
      particlesArray = [];
      const numberOfParticles = (canvas!.width * canvas!.height) / 7000; // density responsive to screen
      
      for (let i = 0; i < numberOfParticles; i++) {
        const x = Math.random() * canvas!.width;
        const y = Math.random() * canvas!.height;
        // Half of particles represents wheat (organics, left side bias roughly), half represents data (cyans, right side bias roughtly)
        // Creating a subtle gradient of distribution across the screen
        const isData = Math.random() > (x / canvas!.width); 
        
        particlesArray.push(new Particle(x, y, isData));
      }
    }

    // animation loop
    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      for (let i = 0; i < particlesArray.length; i++) {
        particlesArray[i].update(mouse);
        particlesArray[i].draw(ctx!);
      }
      // Light connections
      connect();
      animationFrameId = requestAnimationFrame(animate);
    }
    
    // Draw lines between close particles
    function connect() {
        let opacityValue = 1;
        for (let a = 0; a < particlesArray.length; a++) {
            for (let b = a; b < particlesArray.length; b++) {
                const dx = particlesArray[a].x - particlesArray[b].x;
                const dy = particlesArray[a].y - particlesArray[b].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // If particles are close, draw a line
                if (distance < 90) {
                    opacityValue = 1 - (distance/90);
                    // Line color based on the dominant particle type or a mix
                    const r = particlesArray[a].isData ? 0 : 212;
                    const g = particlesArray[a].isData ? 255 : 160;
                    const bVal = particlesArray[a].isData ? 255 : 23;
                    
                    ctx!.strokeStyle = `rgba(${r}, ${g}, ${bVal}, ${opacityValue * 0.2})`;
                    ctx!.lineWidth = 1;
                    ctx!.beginPath();
                    ctx!.moveTo(particlesArray[a].x, particlesArray[a].y);
                    ctx!.lineTo(particlesArray[b].x, particlesArray[b].y);
                    ctx!.stroke();
                    ctx!.shadowBlur = 0; // reset shadow for lines
                }
            }
        }
    }

    init();
    animate();

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handleMouseOut);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <motion.canvas
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.6 }}
      transition={{ duration: 2 }}
      ref={canvasRef}
      className="fixed top-0 left-0 w-full h-full pointer-events-none -z-10"
      style={{
        background: "transparent",
      }}
    />
  );
}

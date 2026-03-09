"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04, // 40ms
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      damping: 20,
      stiffness: 300,
    },
  },
};

interface StaggerGroupProps {
  children: ReactNode;
  delayMs?: number; // override stagger delay
  className?: string;
}

export function StaggerGroup({
  children,
  delayMs,
  className,
}: StaggerGroupProps) {
  const variants = delayMs
    ? {
        ...containerVariants,
        visible: {
          ...containerVariants.visible,
          transition: { staggerChildren: delayMs / 1000 },
        },
      }
    : containerVariants;

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Export item variants for children to use
export { itemVariants as staggerItemVariants };

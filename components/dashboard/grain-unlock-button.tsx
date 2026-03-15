"use client";

import { useState } from "react";
import { UnlockModal } from "./unlock-modal";
import { Button } from "@/components/ui/button";

export function GrainUnlockButton({
  grain,
}: {
  grain: string;
}) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <Button
        className="bg-canola hover:bg-canola-dark text-white"
        onClick={() => setShowModal(true)}
      >
        Add {grain} to crop plan
      </Button>
      {showModal && (
        <UnlockModal
          grain={grain}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

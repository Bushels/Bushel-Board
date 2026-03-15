import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnlockModal } from "../unlock-modal";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("UnlockModal", () => {
  beforeEach(() => {
    push.mockReset();
  });

  it("routes locked grains into the My Farm setup flow", () => {
    const onClose = vi.fn();

    render(<UnlockModal grain="Canola" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText(/acres seeded/i), {
      target: { value: "1500" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue to setup/i }));

    expect(push).toHaveBeenCalledWith("/my-farm?grain=Canola&acres=1500#crop-setup");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

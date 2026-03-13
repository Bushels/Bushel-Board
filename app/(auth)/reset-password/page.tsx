import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getPrairieAuthScene } from "@/lib/auth/auth-scene";

export default function ResetPasswordPage() {
  return <ResetPasswordForm scene={getPrairieAuthScene()} />;
}

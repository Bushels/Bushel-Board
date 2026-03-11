import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { getPrairieAuthScene } from "@/lib/auth/auth-scene";

export default function UpdatePasswordPage() {
  return <UpdatePasswordForm scene={getPrairieAuthScene()} />;
}

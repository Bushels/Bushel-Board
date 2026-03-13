import { LoginForm } from "@/components/auth/login-form";
import { getPrairieAuthScene } from "@/lib/auth/auth-scene";

export default function LoginPage() {
  return <LoginForm scene={getPrairieAuthScene()} />;
}

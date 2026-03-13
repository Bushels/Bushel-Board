import { SignupForm } from "@/components/auth/signup-form";
import { getPrairieAuthScene } from "@/lib/auth/auth-scene";

export default function SignupPage() {
  return <SignupForm scene={getPrairieAuthScene()} />;
}

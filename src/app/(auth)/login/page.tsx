import { redirect } from "next/navigation";
import { Card } from "@/components/ui";
import { getAuthContext } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getAuthContext()) redirect("/dashboard");

  return (
    <Card className="w-full max-w-modal">
      <div className="text-center">
        <p className="text-h2 font-bold text-lg-red">LG Bestshop</p>
        <p className="mt-xs text-caption text-gray-700">고객상담 매니저</p>
      </div>
      <LoginForm />
    </Card>
  );
}

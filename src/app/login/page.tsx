import AuthForms from "@/components/AuthForms";

export const metadata = { title: "Sign in — ImageDB" };

export default function LoginPage() {
  return (
    <div className="py-8">
      <h1 className="mb-6 text-center text-2xl font-bold">Sign in</h1>
      <AuthForms mode="login" />
    </div>
  );
}

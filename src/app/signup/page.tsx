import AuthForms from "@/components/AuthForms";

export const metadata = { title: "Sign up — ImageDB" };

export default function SignupPage() {
  return (
    <div className="py-8">
      <h1 className="mb-2 text-center text-2xl font-bold">Create account</h1>
      <p className="mx-auto mb-6 max-w-sm text-center text-sm text-zinc-500">
        The first account ever created becomes the admin. Everyone after starts as a viewer.
      </p>
      <AuthForms mode="signup" />
    </div>
  );
}

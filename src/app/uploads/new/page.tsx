import UploadForm from "@/components/UploadForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Upload — ImageDB" };

export default function NewUploadPage() {
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">New upload</h1>
      <UploadForm />
      <p className="mt-6 max-w-2xl text-sm text-zinc-500">
        Uploads with no tags land in the{" "}
        <a href="/uploads" className="underline">
          untagged queue
        </a>{" "}
        instead of the board. Duplicates (same file bytes) are rejected.
      </p>
    </>
  );
}

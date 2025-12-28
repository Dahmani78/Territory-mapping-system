import Link from "next/link";

export default function LocaleHome() {
  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Territory Mapping</h1>
      <p className="mt-2 text-sm opacity-80">
        Choose a page:
      </p>

      <ul className="mt-4 list-disc pl-5 space-y-2">
        <li>
          <Link className="underline" href="/test-supabase">
            Test Supabase
          </Link>
        </li>
        <li>
          <Link className="underline" href="/map">
            Map (coming next)
          </Link>
        </li>
      </ul>
    </main>
  );
}

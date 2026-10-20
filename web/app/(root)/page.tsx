// The root URL renders nothing visible: the layout's inline script immediately replaces it with
// the visitor's language page. This fallback shows only if JavaScript is off.
import Link from "next/link";

export default function RootPage() {
  return (
    <main style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <p>
        <Link href="/en/">English</Link> · <Link href="/pt/">Português</Link>
      </p>
    </main>
  );
}

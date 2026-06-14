import Link from "next/link";

// Static footer: a "Back to top" bar, multi-column filler links, and the
// persistent "this is a mock / not affiliated with Amazon" disclaimer.
export function Footer() {
  const columns: Array<{ heading: string; links: string[] }> = [
    {
      heading: "Get to Know Us",
      links: ["About Jamazon", "Careers", "Press Releases", "Nomad Project"],
    },
    {
      heading: "Make Money with Us",
      links: ["Sell on Jamazon", "Become an Affiliate", "Advertise Your Products"],
    },
    {
      heading: "Payment Products",
      links: ["Jamazon Card", "Shop with Points", "Reload Your Balance"],
    },
    {
      heading: "Let Us Help You",
      links: ["Your Account", "Returns Centre", "Help", "Agent Passport FAQ"],
    },
  ];

  return (
    <footer className="mt-10" data-testid="site-footer">
      {/* Back to top */}
      <a
        href="#top"
        className="block bg-amz-slate py-4 text-center text-sm text-white hover:bg-[#37475a]"
      >
        Back to top
      </a>

      {/* Link columns */}
      <div className="bg-amz-navy text-white">
        <div className="mx-auto grid max-w-[1000px] grid-cols-2 gap-6 px-6 py-10 sm:grid-cols-4">
          {columns.map((col) => (
            <div key={col.heading}>
              <h2 className="mb-2 text-sm font-bold">{col.heading}</h2>
              <ul className="space-y-1.5 text-xs text-gray-300">
                {col.links.map((link) => (
                  <li key={link}>
                    <Link href="/" className="hover:underline">
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer bar — always visible */}
      <div className="bg-[#0f1111] px-6 py-6 text-center text-xs text-gray-400">
        <p className="mx-auto max-w-2xl">
          <span className="font-semibold text-gray-200">
            Demo / Mock — not affiliated with, endorsed by, or connected to
            Amazon.
          </span>{" "}
          “Jamazon” is a fictional brand for a proof-of-concept of the{" "}
          <span className="text-gray-200">Nomad</span> agent-passport checkout.
          Checkout verification is hardcoded and entirely client-side — no real
          payments, no Solana, and no network calls are made.
        </p>
        <p className="mt-2">© {new Date().getFullYear()} Jamazon (Mock). All rights reserved.</p>
      </div>
    </footer>
  );
}

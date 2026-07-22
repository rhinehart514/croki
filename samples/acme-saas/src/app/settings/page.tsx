import Link from "next/link";

import { ThemeToggle } from "./theme-toggle";

export default function SettingsPage() {
  return (
    <main className="settings-page">
      <Link className="settings-back" href="/">
        ← Back to Acme
      </Link>

      <header className="settings-header">
        <p className="settings-eyebrow">Your workspace</p>
        <h1>Settings</h1>
        <p className="settings-intro">Choose how Acme looks on this device.</p>
      </header>

      <section className="settings-section" aria-labelledby="appearance-heading">
        <h2 className="settings-section-heading" id="appearance-heading">
          Appearance
        </h2>
        <ThemeToggle />
      </section>
    </main>
  );
}

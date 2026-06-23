import Image from "next/image";
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-10 flex flex-col items-center gap-2">
          <Link href="/">
            <Image
              src="/applied-control-logo.png"
              alt="Applied Control"
              width={180}
              height={56}
              className="h-9 w-auto opacity-90"
            />
          </Link>
          <p className="text-xs font-semibold tracking-widest text-zinc-400">
            FIELD REPAIR REPORTS
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-2xl font-bold text-zinc-900">
            Privacy Policy
          </h1>
          <p className="mb-8 text-sm text-zinc-400">Last updated: June 2025</p>

          <Section title="Overview">
            Applied Control Field Repair Reports (&ldquo;the App&rdquo;) is an
            internal tool used by Applied Control technicians to create, manage,
            and export equipment repair reports. This policy explains what data
            the App handles and how it is protected.
          </Section>

          <Section title="Data We Collect">
            <p className="mb-2">
              The App collects only the data you enter directly:
            </p>
            <ul className="ml-4 list-disc space-y-1 text-sm text-zinc-600">
              <li>
                Repair report details (equipment tag, site, technician name,
                calibration readings, findings)
              </li>
              <li>Voice recordings when using the Voice Mode feature</li>
              <li>Photos attached to repair reports</li>
            </ul>
          </Section>

          <Section title="How Data Is Stored">
            <p className="mb-2">
              <strong>All report data is stored locally on your device</strong>{" "}
              using your browser&rsquo;s built-in IndexedDB storage. No report
              data is sent to Applied Control servers or any cloud database.
              Data does not leave your device except as described below.
            </p>
            <p>
              Exported CSV files are downloaded directly to your device and are
              your responsibility to handle in accordance with your
              organisation&rsquo;s data policies.
            </p>
          </Section>

          <Section title="Voice Mode & Third-Party Transcription">
            <p className="mb-2">
              When you use Voice Mode, short audio recordings of your speech are
              transmitted to <strong>Groq, Inc.</strong> for transcription using
              their Whisper AI service. Audio is sent over an encrypted HTTPS
              connection and is not stored by Applied Control.
            </p>
            <p>
              Groq&rsquo;s handling of audio data is governed by their own
              privacy policy. Do not speak sensitive personal information (e.g.
              patient data, passwords) while using Voice Mode.
            </p>
          </Section>

          <Section title="Authentication">
            <p>
              The App uses a single session cookie (
              <code className="rounded bg-zinc-100 px-1 text-xs">
                __rr_session
              </code>
              ) to verify that you have entered the correct team password. This
              cookie is encrypted, stored only in your browser, and expires
              after 30 days. No personal identity data is collected during
              login.
            </p>
          </Section>

          <Section title="Analytics & Tracking">
            <p>
              The App does <strong>not</strong> use any analytics, advertising
              trackers, third-party cookies, or telemetry. We do not track how
              you use the App, what reports you create, or when you log in.
            </p>
          </Section>

          <Section title="Data Retention">
            <p>
              Because data is stored on your device, you control retention
              entirely. You can delete individual reports from the home screen,
              or clear all App data at any time through your browser&rsquo;s
              storage settings (Settings → Site Data → Clear).
            </p>
          </Section>

          <Section title="Security">
            <p>
              The App is served exclusively over HTTPS. Access requires a team
              password. Session tokens are cryptographically signed and stored
              in httpOnly cookies to prevent JavaScript access. Security headers
              including Content-Security-Policy and X-Frame-Options are applied
              to all responses.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For questions about this policy or data handled by the App,
              contact Applied Control at{" "}
              <a
                href="mailto:info@appliedcontrol.com"
                className="text-[#154A8A] underline"
              >
                info@appliedcontrol.com
              </a>
              .
            </p>
          </Section>

          <div className="mt-8 border-t border-zinc-100 pt-6 text-center">
            <Link
              href="/"
              className="text-sm font-medium text-[#154A8A] hover:underline"
            >
              ← Back to App
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400">
          © {new Date().getFullYear()} Applied Control. All rights reserved.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-base font-semibold text-zinc-800">{title}</h2>
      <div className="text-sm leading-relaxed text-zinc-600">{children}</div>
    </div>
  );
}

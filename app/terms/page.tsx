import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage } from "@/src/components/home/LegalPage";

export const metadata: Metadata = { title: "Terms of Service — TubeRack", description: "The rules for using TubeRack." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="September 26, 2026">
      <p>These terms apply when you use TubeRack. By creating an account you agree to them and to our <Link href="/privacy">Privacy Policy</Link>.</p>

      <h2>Your account</h2>
      <p>Keep your sign-in details safe and give accurate information. You are responsible for what happens under your account. You must be at least 13 years old (or the minimum age in your country).</p>

      <h2>YouTube</h2>
      <p>TubeRack uses YouTube API Services. When you connect a channel you agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>. TubeRack only uploads or changes content on your channel when you ask it to.</p>

      <h2>Your content</h2>
      <p>You own what you create and upload. You give us permission to store and process it only to run the service for you. You are responsible for having the rights to what you upload and publish, and for following YouTube&apos;s policies and the law.</p>

      <h2>Generated content, stock and music</h2>
      <p>Generated scripts, images, voices and videos can contain mistakes — review them before publishing. Stock footage and music come with their own licences (for example Creative Commons tracks that require the credit TubeRack shows you); follow those licences.</p>

      <h2>Acceptable use</h2>
      <ul>
        <li>No illegal, harmful, hateful, deceptive or infringing content.</li>
        <li>No spam, automated abuse, or attempts to break or overload the service.</li>
        <li>No impersonating people or misleading viewers.</li>
      </ul>

      <h2>Limits and availability</h2>
      <p>Some features have daily limits and depend on third-party services, so they can be slow or unavailable at times. We may change or discontinue features.</p>

      <h2>Ending your account</h2>
      <p>You can delete your account at any time from <Link href="/settings">Settings</Link>. We may suspend accounts that break these terms.</p>

      <h2>Disclaimer</h2>
      <p>TubeRack is provided &quot;as is&quot; without warranties. To the extent the law allows, we are not liable for indirect losses, lost revenue, or channel results.</p>

      <h2>Contact</h2>
      <p>Questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}

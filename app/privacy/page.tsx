import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage } from "@/src/components/home/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy — TubeRack", description: "What TubeRack collects, how it is used, and your choices." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 26, 2026">
      <p>TubeRack is a workspace for YouTube creators: research, scripts, voice-overs, visuals, video editing, packaging and publishing. This policy explains what we collect, why, and the choices you have.</p>

      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account details</strong> — your name, email address and a securely hashed password, or your Google profile (name, email, picture) if you sign in with Google.</li>
        <li><strong>Your work</strong> — projects, ideas, scripts, storyboards, timelines, thumbnails and the media you upload or generate (images, voice-overs, video and music you add).</li>
        <li><strong>YouTube data (only when you connect a channel)</strong> — your channel details, your videos and their statistics, and YouTube Analytics reports. We also store the access tokens Google issues, encrypted, so the app can act for you.</li>
        <li><strong>Technical data</strong> — sign-in sessions, basic request logs and usage counts needed to run and secure the service.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To provide the features you use: show your channel and analytics, suggest ideas, write and voice scripts, build and export videos, and upload or update videos on your channel <strong>only when you press Publish</strong> or ask for a channel change.</li>
        <li>To keep your account secure and the service reliable.</li>
        <li>To send account emails (verification, password reset, and briefings you opt into).</li>
      </ul>
      <p>We do not sell your data, use it for advertising, or use YouTube data for anything other than showing it to you and the features you request.</p>

      <h2>Google and YouTube data</h2>
      <p>TubeRack uses YouTube API Services. By connecting a channel you also agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>, and Google&apos;s handling of your data is described in the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</p>
      <p>TubeRack&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. People do not read your Google data unless you ask us to for support, it is needed for security, or the law requires it.</p>
      <p>You can disconnect YouTube inside TubeRack at any time, and revoke access from your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google account permissions page</a>. Stored YouTube data is deleted when you disconnect or delete your account, and cached API data is refreshed or removed within 30 days.</p>

      <h2>Service providers</h2>
      <p>We use trusted providers to run TubeRack: hosting (Vercel), database and file storage (Supabase), email (Resend), and generation services for text, images, voice and video. Stock footage and music come from Pixabay and Jamendo. These providers process data only to deliver the service to you.</p>

      <h2>Retention and deletion</h2>
      <p>Your data is kept while your account is active. You can delete individual items at any time and delete your whole account from <Link href="/settings">Settings</Link>, which removes your projects, media and connected-channel data.</p>

      <h2>Security</h2>
      <p>Connections are encrypted (HTTPS), passwords are hashed, and YouTube tokens are encrypted at rest.</p>

      <h2>Children</h2>
      <p>TubeRack is not directed to children under 13 (or the minimum age in your country).</p>

      <h2>Changes and contact</h2>
      <p>We will update this page if our practices change. Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage } from "@/src/components/home/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy — Recktube", description: "What Recktube collects, how it is used, and your choices." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 30, 2026">
      <p>Recktube is a workspace for YouTube creators: research, scripts, voice-overs, visuals, video editing, packaging and publishing. This policy explains what we collect, why, and the choices you have.</p>

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
      <p>Recktube uses YouTube API Services. By connecting a channel you also agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>, and Google&apos;s handling of your data is described in the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.</p>
      <p>Recktube&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. People do not read your Google data unless you ask us to for support, it is needed for security, or the law requires it.</p>
      <p>You can disconnect YouTube inside Recktube at any time, and revoke access from your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google account permissions page</a>. Your YouTube connection and tokens are deleted when you disconnect or delete your account, and Recktube revokes its access with Google. Cached YouTube API data (such as trend and niche scans) is refreshed or deleted automatically within 30 days.</p>

      <h2>Service providers</h2>
      <p>We use trusted providers to run Recktube. Each processes your data only to deliver the feature you use:</p>
      <ul>
        <li><strong>Hosting and data:</strong> Vercel (hosting), Supabase (database and file storage), Resend (email).</li>
        <li><strong>Text, research, images and voice:</strong> Google (Gemini API and Cloud Text-to-Speech), with Mistral AI, NVIDIA and BytePlus as backups when the main service is busy. The prompts, scripts and text you generate with are sent to them to produce the result.</li>
        <li><strong>Support assistant and email support:</strong> when you use in-app support or email support@recktube.xyz, your message and the account details needed to help you (such as your credit balance or why a video failed) are processed by Google&apos;s Gemini API to write the answer. Before anything is sent, your name and email address are replaced with placeholders, so the provider does not see who you are; please don&apos;t include passwords, card numbers or other sensitive details in your messages. Our team&apos;s internal tools work the same way.</li>
        <li><strong>AI video clips:</strong> open-source video models run on Hugging Face. The prompt and any image you choose to animate are sent there.</li>
        <li><strong>Backup voice:</strong> a self-hosted speech server operated by Recktube.</li>
        <li><strong>Stock footage and music:</strong> Pixabay and Jamendo (search terms only).</li>
        <li><strong>YouTube:</strong> YouTube API Services, only for your connected channel.</li>
      </ul>

      <h2>Retention and deletion</h2>
      <p>Your data is kept while your account is active. You can delete individual items at any time and delete your whole account from <Link href="/settings">Settings</Link>, which removes your projects, media and connected-channel data.</p>

      <h2>Security</h2>
      <p>Connections are encrypted (HTTPS), passwords are hashed, and YouTube tokens are encrypted at rest.</p>

      <h2>Children</h2>
      <p>Recktube is not directed to children under 13 (or the minimum age in your country).</p>

      <h2>Changes and contact</h2>
      <p>We will update this page if our practices change. Questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </LegalPage>
  );
}

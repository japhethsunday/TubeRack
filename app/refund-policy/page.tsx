import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage } from "@/src/components/home/LegalPage";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy · Recktube",
  description: "How cancelling a Recktube plan works, and how to ask for a refund.",
  alternates: { canonical: "/refund-policy" },
};

export default function RefundPolicy() {
  return (
    <LegalPage title="Refund & Cancellation Policy" updated="September 30, 2026">
      <p>This policy explains how paid Recktube plans and credit packs are billed, how to cancel, and when you can get a refund. Prices are listed on our <Link href="/pricing">Pricing page</Link>.</p>

      <h2>Plans and billing</h2>
      <ul>
        <li>Paid plans (Creator, Pro and Studio) are billed monthly, in advance, at the price shown on the Pricing page when you subscribe.</li>
        <li>Credit packs are one-off purchases. The credits are added to your balance straight away.</li>
        <li>Payments are processed securely by Paystack. Recktube never sees or stores your full card number.</li>
      </ul>

      <h2>Cancelling</h2>
      <ul>
        <li>You can cancel a paid plan at any time. There is no cancellation fee.</li>
        <li>Your plan stays active until the end of the month you have already paid for. After that, your account returns to the Free plan and you are not charged again.</li>
        <li>Your projects, videos and account stay available on the Free plan.</li>
        <li>To cancel, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the email address on your account.</li>
      </ul>

      <h2>Refunds</h2>
      <ul>
        <li>If something went wrong with a payment — for example you were charged twice, charged after cancelling, or charged the wrong amount — email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> within 7 days of the payment and we will make it right, including a full refund of the incorrect charge.</li>
        <li>Refunds go back to the original payment method. Your bank or card provider may take a few business days to show it.</li>
        <li>Credits are only used when a generation succeeds, and a full generated video that can&apos;t be made is refunded to your credit balance automatically.</li>
      </ul>

      <h2>Contact</h2>
      <p>Questions about billing, cancelling or refunds: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, or use the form on our <Link href="/support">Support page</Link>.</p>
    </LegalPage>
  );
}

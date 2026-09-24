import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginForm } from "@/app/(auth)/login/form";
import { ResetForm } from "@/app/(auth)/reset-password/form";
import { VerifyForm } from "@/app/(auth)/verify-email/form";
import { AccountStateBanner } from "@/src/components/auth/AccountStateBanner";
import { canConfirmDelete } from "@/src/components/auth/form";
import { AuthBoundaryNotice } from "@/src/components/auth/AuthBoundaryNotice";
import { PasswordStrength } from "@/src/components/auth/PasswordStrength";
import { ContextCrumbs } from "@/src/components/auth/ContextCrumbs";
import { ProfilePanel, SecurityPanel, SessionsPanel } from "@/src/components/settings/account-panels";
import { NotificationsPanel } from "@/src/components/settings/preference-panels";
import { BillingPanel, DataPanel } from "@/src/components/settings/workspace-panels";
import { ACCOUNT_STATES } from "@/src/lib/auth/session";

/** Server-render auth/account tests: labels, associations, honest states. */
describe("auth screens", () => {
  it("login form labels fields, links recovery, links sign-up", () => {
    const html = renderToStaticMarkup(<LoginForm returnTo="/dashboard" expired={false} />);
    assert.ok(html.includes("Welcome back"));
    assert.ok(html.includes("Forgot password?"));
    assert.ok(html.includes("Stay signed in for 30 days"));
    assert.ok(html.includes("/signup"));
  });

  it("login surfaces the expired-session state from a param", () => {
    const html = renderToStaticMarkup(<LoginForm returnTo="/dashboard" expired={true} />);
    assert.ok(html.includes("Session expired"));
  });

  it("reset form asks for a new password; expired state is specific", () => {
    const form = renderToStaticMarkup(<ResetForm token="abc" expired={false} />);
    assert.ok(form.includes("Set new password"));
    assert.ok(form.includes("New password"));
    const expired = renderToStaticMarkup(<ResetForm token="abc" expired={true} />);
    assert.ok(expired.includes("has expired"));
  });

  it("verify offers resend without a token and checks the link with one", () => {
    const pending = renderToStaticMarkup(<VerifyForm />);
    assert.ok(pending.includes("Check your inbox"));
    assert.ok(pending.includes("Resend verification email"));
    const linked = renderToStaticMarkup(<VerifyForm token="abc" />);
    assert.ok(linked.includes("Checking your link"));
  });

  it("renders every account state with its tone", () => {
    for (const state of Object.keys(ACCOUNT_STATES)) {
      const html = renderToStaticMarkup(
        <AccountStateBanner state={state as keyof typeof ACCOUNT_STATES} />,
      );
      assert.ok(html.includes(ACCOUNT_STATES[state as keyof typeof ACCOUNT_STATES].title), state);
    }
  });

  it("boundary notice states what was and was not done", () => {
    const html = renderToStaticMarkup(
      <AuthBoundaryNotice feature="Sign-in" validated="Local checks passed." returnTo="/settings" />,
    );
    assert.ok(html.includes("Nothing was sent or stored"));
    assert.ok(html.includes("/settings"));
  });

  it("strength meter announces its label", () => {
    const html = renderToStaticMarkup(<PasswordStrength value="Correct-Horse-99" />);
    assert.ok(html.includes("Strong"));
  });

  it("context crumbs separate user, workspace, channel, project", () => {
    const html = renderToStaticMarkup(<ContextCrumbs project="Ep 1" />);
    for (const part of ["User", "Workspace", "Channel", "Project", "Ep 1"]) {
      assert.ok(html.includes(part), part);
    }
  });
});

describe("settings panels", () => {
  it("profile, security, and sessions render before the session loads", () => {
    const profile = renderToStaticMarkup(<ProfilePanel />);
    assert.ok(profile.includes("Loading profile"));
    const security = renderToStaticMarkup(<SecurityPanel />);
    assert.ok(security.includes("Change password"));
    assert.ok(security.includes("Reset by email"));
    const sessions = renderToStaticMarkup(<SessionsPanel />);
    assert.ok(sessions.includes("Sign out other devices"));
  });

  it("notifications list purposeful events; billing and data stay honest", () => {
    const notifs = renderToStaticMarkup(<NotificationsPanel />);
    assert.ok(notifs.includes("Render completed"));
    assert.ok(notifs.includes("save automatically"));
    const billing = renderToStaticMarkup(<BillingPanel />);
    assert.ok(billing.includes("Free"));
    const data = renderToStaticMarkup(<DataPanel />);
    assert.ok(data.includes("Export your data"));
    assert.ok(data.includes("Download export"));
    assert.equal(canConfirmDelete("DELETE"), true);
    assert.equal(canConfirmDelete("  DELETE  "), true);
    assert.equal(canConfirmDelete("delete"), false);
    assert.equal(canConfirmDelete(""), false);
  });
});

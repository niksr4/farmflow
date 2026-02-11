import { PRIVACY_CONTACT_EMAIL, PRIVACY_NOTICE_VERSION } from "@/lib/privacy-config"

export default function PrivacyNoticePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Privacy Notice</p>
        <h1 className="text-3xl font-semibold text-foreground">FarmFlow Privacy Notice</h1>
        <p className="text-sm text-muted-foreground">Version {PRIVACY_NOTICE_VERSION}</p>
      </div>

      <section className="space-y-2 text-sm text-muted-foreground">
        <p>
          This notice explains how FarmFlow collects, uses, and protects personal data when you use the FarmFlow
          application. It applies to tenant users, estate staff, and any personal data recorded in operational logs.
        </p>
        <p>
          If you have questions or want to exercise your data rights, contact us at{" "}
          <span className="font-medium text-foreground">{PRIVACY_CONTACT_EMAIL}</span>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">What We Collect</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Account identifiers such as username and role.</li>
          <li>Operational logs that record who created or updated records.</li>
          <li>Optional buyer or contact names you enter in dispatch or sales notes.</li>
          <li>Consent and privacy notice acknowledgements.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">How We Use Personal Data</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Authenticate users and enforce tenant access controls.</li>
          <li>Maintain traceability and audit history for operational records.</li>
          <li>Provide exports, reconciliation, and regulatory reporting.</li>
          <li>Send product updates only if you opt in.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Your Rights</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Request access to your personal data export.</li>
          <li>Correct inaccurate personal data.</li>
          <li>Request deletion or anonymization when applicable.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Use the Privacy &amp; DPDP section in Settings to submit requests.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Retention</h2>
        <p className="text-sm text-muted-foreground">
          Personal data is retained only as long as needed for operational, legal, or audit purposes. Once those purposes
          are complete, data is deleted or anonymized according to the retention policy configured for your tenant.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Security</h2>
        <p className="text-sm text-muted-foreground">
          We use access controls, tenant isolation, and audit trails to safeguard personal data. If we detect a personal
          data breach, we will notify affected users and regulators as required.
        </p>
      </section>
    </div>
  )
}

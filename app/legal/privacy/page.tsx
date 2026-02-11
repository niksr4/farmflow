export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="text-3xl font-semibold text-foreground">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Effective: 2026-02-09</p>
      </div>

      <section className="space-y-3 text-sm text-muted-foreground">
        <p>
          This Privacy Policy describes how FarmFlow collects, uses, and protects personal data when you use our
          services. For India-specific notice and consent, see the Privacy Notice.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Information We Collect</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Account identifiers (username, role, tenant ID).</li>
          <li>Operational logs and audit trails.</li>
          <li>Optional buyer or contact data entered by customers.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">How We Use Data</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Provide and secure the service.</li>
          <li>Maintain traceability and audit records.</li>
          <li>Comply with legal obligations.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Data Retention</h2>
        <p className="text-sm text-muted-foreground">
          We retain personal data only as long as necessary for operational, legal, or audit purposes. Data is deleted or
          anonymized when no longer required, subject to lawful retention.
        </p>
      </section>
    </div>
  )
}

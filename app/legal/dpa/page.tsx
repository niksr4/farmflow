export default function DpaPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="text-3xl font-semibold text-foreground">Data Processing Addendum (DPA)</h1>
        <p className="text-sm text-muted-foreground">Effective: 2026-02-09</p>
      </div>

      <section className="space-y-3 text-sm text-muted-foreground">
        <p>
          This DPA applies to customers using FarmFlow in a business-to-business capacity. It governs how FarmFlow, as a
          processor, handles personal data on behalf of the customer.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Processing Details</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Purpose: provide farm operations, traceability, billing, and reporting.</li>
          <li>Data types: user identifiers, audit logs, operational records.</li>
          <li>Duration: for the term of the agreement and as required by law.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Security Measures</h2>
        <p className="text-sm text-muted-foreground">
          We maintain access controls, tenant isolation, audit logging, and encrypted transport. Details are available in
          the Security Baseline documentation.
        </p>
      </section>
    </div>
  )
}

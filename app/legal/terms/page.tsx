export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="text-3xl font-semibold text-foreground">Master Service Agreement / Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Effective: 2026-02-09</p>
      </div>

      <section className="space-y-3 text-sm text-muted-foreground">
        <p>
          These terms govern your use of FarmFlow. By accessing the service, you agree to the terms below. If you are
          entering into this agreement on behalf of a company, you represent that you have authority to bind that
          company.
        </p>
        <p>
          FarmFlow provides operational tooling for coffee estate management, including inventory, processing, dispatch,
          sales, and billing. We do not provide financial, legal, or tax advice.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Customer Responsibilities</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Maintain accurate records and authorized users.</li>
          <li>Ensure data you upload is lawful and does not infringe third-party rights.</li>
          <li>Safeguard credentials and report suspicious activity promptly.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Availability</h2>
        <p className="text-sm text-muted-foreground">
          We aim to keep the service available and will communicate planned maintenance in advance. We do not guarantee
          uninterrupted availability.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Data Ownership</h2>
        <p className="text-sm text-muted-foreground">
          You own your operational data. We process it solely to provide the service and as described in the Privacy
          Policy and DPA.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Limitation of Liability</h2>
        <p className="text-sm text-muted-foreground">
          To the extent permitted by law, FarmFlow is not liable for indirect or consequential damages, including loss of
          profits or data.
        </p>
      </section>
    </div>
  )
}

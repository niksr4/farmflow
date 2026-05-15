export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="text-3xl font-semibold text-foreground">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Effective: 2026-02-09 &nbsp;·&nbsp; Last updated: 2026-05-08</p>
      </div>

      <section className="space-y-3 text-sm text-muted-foreground">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of FarmFlow, a software-as-a-service
          product operated by Nikhil Chengappa (&ldquo;FarmFlow&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By
          registering for or using FarmFlow, you agree to these Terms. If you are entering into this agreement on behalf
          of a company or organisation, you represent that you have authority to bind that entity.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">1. Service Description</h2>
        <p className="text-sm text-muted-foreground">
          FarmFlow provides operational tooling for farm and estate management, including inventory tracking, processing
          records, dispatch, sales, accounts, and reporting. We do not provide financial, legal, agronomic, or tax
          advice. Any AI-generated content or recommendations are informational only and should not replace professional
          judgement.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">2. Accounts and Access</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>You must provide accurate information when registering and keep it up to date.</li>
          <li>You are responsible for all activity that occurs under your account and for maintaining the confidentiality of your credentials.</li>
          <li>You must notify us immediately of any unauthorised use of your account.</li>
          <li>Each workspace is tenant-isolated; you may not attempt to access another tenant&apos;s data.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">3. Subscriptions and Payment</h2>
        <p className="text-sm text-muted-foreground">
          FarmFlow is offered on a subscription basis. Pricing is listed on the Plans page. Subscriptions renew
          automatically at the end of each billing cycle unless cancelled before the renewal date. By providing payment
          details you authorise us to charge the applicable subscription fee on each renewal date.
        </p>
        <p className="text-sm text-muted-foreground">
          All fees are quoted and charged in Indian Rupees (INR) and are exclusive of applicable taxes (including GST).
          We reserve the right to change pricing with 30 days&apos; prior notice.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">4. Free Trial</h2>
        <p className="text-sm text-muted-foreground">
          New accounts receive a 30-day free trial with no credit card required. At the end of the trial, continued
          access requires a paid subscription. Data is retained for a reasonable period after trial expiry to allow
          you to subscribe and resume.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">5. Cancellation and Refunds</h2>
        <p className="text-sm text-muted-foreground">
          You may cancel your subscription at any time from your account settings or by contacting us. Cancellation
          takes effect at the end of the current billing period — you retain access until that date. We do not offer
          pro-rata refunds for unused time within a billing period. If you believe a charge was made in error, contact
          us within 14 days and we will review it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">6. Acceptable Use</h2>
        <p className="text-sm text-muted-foreground">You agree not to:</p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>Use FarmFlow for any unlawful purpose or in violation of applicable law.</li>
          <li>Upload or transmit data you do not have the right to share.</li>
          <li>Attempt to reverse-engineer, disassemble, or gain unauthorised access to any part of the service.</li>
          <li>Use automated means to scrape, crawl, or extract data from the service at scale.</li>
          <li>Interfere with or disrupt the integrity or performance of the service or its underlying infrastructure.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">7. Customer Responsibilities</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>You are responsible for the accuracy of data you enter into FarmFlow.</li>
          <li>You are responsible for managing user roles and access within your workspace.</li>
          <li>You must ensure that any personal data of workers or third parties you enter complies with applicable data protection law, including obtaining necessary consent.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">8. Data Ownership</h2>
        <p className="text-sm text-muted-foreground">
          You own your operational data. We process it solely to provide the service and as described in the Privacy
          Policy and Data Processing Addendum. We will not sell your data to third parties.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">9. Availability</h2>
        <p className="text-sm text-muted-foreground">
          We aim to maintain high availability and will communicate planned maintenance in advance. We do not guarantee
          uninterrupted or error-free service. We are not liable for downtime caused by circumstances outside our
          reasonable control, including failures of third-party infrastructure providers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">10. Intellectual Property</h2>
        <p className="text-sm text-muted-foreground">
          FarmFlow and its underlying software, design, and content are owned by us and protected by applicable
          intellectual property law. These Terms do not grant you any ownership rights in FarmFlow. We grant you a
          limited, non-exclusive, non-transferable licence to use the service for your internal estate operations
          during your subscription.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">11. Limitation of Liability</h2>
        <p className="text-sm text-muted-foreground">
          To the maximum extent permitted by applicable law, FarmFlow&apos;s total liability to you for any claim
          arising from these Terms or your use of the service shall not exceed the fees you paid to us in the three
          months preceding the claim. We are not liable for indirect, incidental, consequential, or punitive damages,
          including loss of profits, data, or business opportunity.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">12. Governing Law and Disputes</h2>
        <p className="text-sm text-muted-foreground">
          These Terms are governed by the laws of India. Any dispute arising from or related to these Terms shall be
          subject to the exclusive jurisdiction of the courts of Bengaluru, Karnataka, India. Before initiating formal
          proceedings, the parties agree to attempt to resolve disputes in good faith through direct communication for
          at least 30 days.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">13. Changes to These Terms</h2>
        <p className="text-sm text-muted-foreground">
          We may update these Terms from time to time. We will notify subscribers by email at least 14 days before
          material changes take effect. Continued use of FarmFlow after the effective date constitutes acceptance of
          the updated Terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">14. Contact</h2>
        <p className="text-sm text-muted-foreground">
          For questions about these Terms, contact us at{" "}
          <a href="mailto:nikhil@thefarmflow.in" className="underline hover:text-foreground">
            nikhil@thefarmflow.in
          </a>.
        </p>
      </section>
    </div>
  )
}

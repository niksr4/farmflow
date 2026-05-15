export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12 space-y-6">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Legal</p>
        <h1 className="text-3xl font-semibold text-foreground">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Effective: 2026-02-09 &nbsp;·&nbsp; Last updated: 2026-05-08</p>
      </div>

      <section className="space-y-3 text-sm text-muted-foreground">
        <p>
          This Privacy Policy describes how FarmFlow, operated by Nikhil Chengappa (&ldquo;FarmFlow&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;), collects, uses, stores, and protects personal data when you use our
          service. FarmFlow is primarily used by individuals and organisations in India, and we are committed to
          compliance with India&apos;s Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;) as well as
          applicable provisions of the Information Technology Act, 2000 and IT (Amendment) Act, 2008.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
        <p className="text-sm text-muted-foreground">We collect the following categories of data:</p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>Account data:</strong> username, email address, role, and tenant association provided at registration.</li>
          <li><strong>Operational data:</strong> inventory records, processing logs, dispatch records, sales entries, accounts, and any other data you enter while using FarmFlow.</li>
          <li><strong>Worker or contact data:</strong> names or identifiers of estate workers or buyers that you optionally enter into the system. You are responsible for ensuring lawful basis for entering such data.</li>
          <li><strong>Usage and analytics data:</strong> pages visited, features used, session duration, and click events — collected via PostHog (analytics) and Google Analytics 4 (GA4) to improve the product.</li>
          <li><strong>Technical data:</strong> IP address, browser type, device type, and cookies necessary for session management and security.</li>
          <li><strong>Communications:</strong> messages you send via the contact form or by email.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">2. Cookies and Analytics</h2>
        <p className="text-sm text-muted-foreground">
          FarmFlow uses cookies and similar technologies for the following purposes:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>Session cookies:</strong> required to keep you logged in. These are strictly necessary and cannot be disabled.</li>
          <li><strong>PostHog:</strong> a product analytics tool used to understand how features are used and to identify areas for improvement. PostHog is configured to route data via our own domain (<code>/ingest/</code>) and stores data in the EU. PostHog may set persistent cookies.</li>
          <li><strong>Google Analytics 4 (GA4):</strong> used to understand overall website traffic and acquisition channels. GA4 sets cookies (including <code>_ga</code> and <code>_gid</code>) and sends anonymised usage data to Google&apos;s servers.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          By using FarmFlow, you consent to the use of analytics cookies described above. You can opt out of Google
          Analytics tracking at any time by installing the{" "}
          <a
            href="https://tools.google.com/dlpage/gaoptout"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground"
          >
            Google Analytics Opt-out Browser Add-on
          </a>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">3. How We Use Data</h2>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li>To provide, operate, and secure the FarmFlow service.</li>
          <li>To authenticate users and manage sessions.</li>
          <li>To maintain traceability, audit records, and operational history within your workspace.</li>
          <li>To send transactional emails such as verification codes, weekly digests, and account alerts.</li>
          <li>To respond to support requests and enquiries.</li>
          <li>To analyse product usage and improve features.</li>
          <li>To comply with legal obligations.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          We do not use your operational data for advertising, and we do not sell any personal data to third parties.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">4. Legal Basis for Processing (DPDP Act)</h2>
        <p className="text-sm text-muted-foreground">
          Under India&apos;s Digital Personal Data Protection Act, 2023, we process personal data on the following
          grounds:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>Consent:</strong> where you have provided explicit consent at registration or through use of the service, including consent for analytics cookies.</li>
          <li><strong>Contractual necessity:</strong> processing required to provide the service you have subscribed to.</li>
          <li><strong>Legitimate interests:</strong> product analytics and security monitoring, where these do not override your privacy rights.</li>
          <li><strong>Legal obligation:</strong> where we are required to retain or share data by applicable law.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">5. Data Sharing and Subprocessors</h2>
        <p className="text-sm text-muted-foreground">
          We share data only with the third-party service providers (&ldquo;subprocessors&rdquo;) necessary to operate
          FarmFlow. A full list is available on the{" "}
          <a href="/legal/subprocessors" className="underline hover:text-foreground">Subprocessors</a> page. Key
          subprocessors include:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>Neon (database):</strong> serverless PostgreSQL; data stored in AWS regions.</li>
          <li><strong>Vercel (hosting):</strong> application hosting and serverless functions.</li>
          <li><strong>Resend (email):</strong> transactional email delivery.</li>
          <li><strong>Anthropic (AI):</strong> AI assistant and analysis features pass relevant context to Anthropic&apos;s API. No data is retained by Anthropic for training without consent.</li>
          <li><strong>PostHog (analytics):</strong> product analytics, EU-hosted.</li>
          <li><strong>Google Analytics (analytics):</strong> website traffic analytics.</li>
          <li><strong>Sentry (error tracking):</strong> error and performance monitoring.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          We do not transfer personal data to countries outside India or the EEA without appropriate safeguards.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">6. Data Retention</h2>
        <p className="text-sm text-muted-foreground">
          We retain personal data for as long as your account is active or as necessary to provide the service.
          Operational data (records you create) is retained for the duration of your subscription and for a reasonable
          period after account closure to allow data export. Account data is deleted or anonymised within 90 days of a
          confirmed account deletion request. Some data may be retained longer where required by legal or audit
          obligations.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">7. Your Rights</h2>
        <p className="text-sm text-muted-foreground">
          Under the DPDP Act and other applicable law, you have the right to:
        </p>
        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
          <li><strong>Access:</strong> request a summary of personal data we hold about you.</li>
          <li><strong>Correction:</strong> request correction of inaccurate personal data.</li>
          <li><strong>Erasure:</strong> request deletion of your personal data, subject to legal retention requirements.</li>
          <li><strong>Withdraw consent:</strong> withdraw consent for processing where consent is the lawful basis, without affecting prior processing.</li>
          <li><strong>Grievance redressal:</strong> raise a complaint with our designated grievance officer (see below).</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          To exercise any of these rights, contact us at{" "}
          <a href="mailto:nikhil@thefarmflow.in" className="underline hover:text-foreground">nikhil@thefarmflow.in</a>.
          We will respond within 30 days.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">8. Data Security</h2>
        <p className="text-sm text-muted-foreground">
          We implement appropriate technical and organisational measures to protect personal data against unauthorised
          access, alteration, disclosure, or destruction. These include tenant-level data isolation (row-level
          security), encrypted connections (TLS), role-based access control, and audit logging. No method of
          transmission over the internet is completely secure; we cannot guarantee absolute security.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">9. Children&apos;s Privacy</h2>
        <p className="text-sm text-muted-foreground">
          FarmFlow is not directed at individuals under the age of 18. We do not knowingly collect personal data from
          minors. If you believe a minor has registered, please contact us and we will remove the account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">10. Grievance Officer</h2>
        <p className="text-sm text-muted-foreground">
          In accordance with the Information Technology Act, 2000 and the DPDP Act, 2023, the designated Grievance
          Officer for FarmFlow is:
        </p>
        <p className="text-sm text-muted-foreground">
          Nikhil Chengappa<br />
          Email:{" "}
          <a href="mailto:nikhil@thefarmflow.in" className="underline hover:text-foreground">nikhil@thefarmflow.in</a><br />
          We aim to acknowledge grievances within 48 hours and resolve them within 30 days.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">11. Changes to This Policy</h2>
        <p className="text-sm text-muted-foreground">
          We may update this Privacy Policy from time to time. We will notify users by email before material changes
          take effect. Continued use of FarmFlow after the effective date constitutes acceptance of the updated policy.
        </p>
      </section>
    </div>
  )
}

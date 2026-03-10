import fs from "fs/promises";
import path from "path";

/**
 * LEGAL & COMPLIANCE – Ensures each product has baseline GDPR/ToS documents.
 *
 * Exports:
 *   - ensureLegalCompliance(appId, spec?): Promise<{ compliant: boolean, files: string[], missing: string[] }>
 *
 * Behavior:
 *   - Creates customizable, professional English templates for:
 *       - Terms of Service (terms-of-service.md)
 *       - Privacy Policy / GDPR (privacy-policy-gdpr.md)
 *   - Writes them to apps/<appId>/legal/.
 *   - Never throws; logs problems instead.
 */

const root = process.cwd();

async function log(level, message, data = null) {
  const LOG_PATH = path.join(root, "logs", "legal_compliance.log");
  const ts = new Date().toISOString();
  const payload =
    data != null && data !== undefined
      ? { level, message, ...(typeof data === "object" ? data : { value: data }) }
      : { level, message };
  const extra =
    typeof payload === "object" && payload.message
      ? Object.fromEntries(Object.entries(payload).filter(([k]) => k !== "message"))
      : {};
  const line =
    ts +
    " [" + (level || "info").toUpperCase() + "] " +
    (payload.message || message) +
    (Object.keys(extra).length ? " " + JSON.stringify(extra) : "");

  try {
    await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
    await fs.appendFile(LOG_PATH, line + "\n", "utf-8");
  } catch {
  }
}

function buildTosTemplate(productName) {
  const name = productName || "[PRODUCT_NAME]";
  return `# Terms of Service for ${name}

> IMPORTANT: This is a generic template. Replace bracketed fields with your own company details and seek legal review before production use.

## 1. Introduction

These Terms of Service ("Terms") govern your access to and use of ${name} (the "Service"). By accessing or using the Service you agree to be bound by these Terms.

If you do not agree to these Terms, you must not use the Service.

## 2. The Service

${name} is provided as a digital tool for professional and/or personal use. The Service is provided on an "as is" and "as available" basis. We do not guarantee uninterrupted or error-free operation.

## 3. Eligibility

You may use the Service only if you are at least 18 years old and legally capable of entering into a binding agreement, or have the consent of a parent or legal guardian.

## 4. Acceptable Use

You agree not to:

- use the Service for any unlawful, harmful or abusive purpose;
- upload malicious code, attempt to gain unauthorized access or interfere with the integrity of the Service;
- use the Service to process special categories of personal data (e.g. health, religion, political opinions) unless explicitly permitted and configured.

## 5. Accounts and Security

You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. Notify us immediately of any unauthorized use or security breach.

## 6. Subscription and Payment (if applicable)

If the Service is offered on a paid basis, payment terms, billing cycles and cancellation rules will be specified on the pricing page and/or order form.

## 7. Intellectual Property

All intellectual property rights in and to the Service (excluding user content) are owned by [COMPANY_NAME] or its licensors. You are granted a limited, non-exclusive, non-transferable license to use the Service in accordance with these Terms.

## 8. User Content

You retain ownership of your content. By submitting content to the Service you grant [COMPANY_NAME] a limited license to host, process and display that content solely for the purpose of operating and improving the Service.

## 9. Data Protection and Privacy

Our processing of personal data is described in the Privacy Policy. When using the Service in a business context you are responsible for:

- having a lawful basis for processing personal data;
- providing end-users with appropriate information and notices;
- entering into a data processing agreement where required.

## 10. Third-Party Services

The Service may integrate with third-party services (e.g. payment providers, analytics). We are not responsible for the terms or privacy practices of third parties.

## 11. Disclaimer of Warranties

The Service is provided without warranties of any kind, whether express or implied. To the maximum extent permitted by law we disclaim all warranties of merchantability, fitness for a particular purpose and non-infringement.

## 12. Limitation of Liability

To the maximum extent permitted by law, [COMPANY_NAME] shall not be liable for any indirect, incidental, consequential, special or punitive damages, or for any loss of profits, revenue, data or goodwill.

## 13. Changes to the Service

We may modify, suspend or discontinue the Service at any time. Where appropriate we will provide reasonable notice.

## 14. Changes to These Terms

We may update these Terms from time to time. The "Last updated" date at the top of this document will be revised accordingly. Continued use of the Service after changes take effect constitutes acceptance of the updated Terms.

## 15. Governing Law and Jurisdiction

These Terms are governed by the laws of [JURISDICTION]. Any disputes shall be subject to the exclusive jurisdiction of the courts of [JURISDICTION].

## 16. Contact

If you have questions about these Terms, contact [COMPANY_CONTACT_EMAIL].
`;
}

function buildPrivacyTemplate(productName) {
  const name = productName || "[PRODUCT_NAME]";
  return `# Privacy Policy for ${name}

> IMPORTANT: This is a generic GDPR-oriented template. Replace bracketed fields with your own company details and seek legal review before production use.

## 1. Who We Are

[COMPANY_NAME] ("we", "us") operates ${name}. We act as data controller for personal data collected through the Service unless otherwise agreed in a data processing agreement.

Contact: [COMPANY_CONTACT_EMAIL]

## 2. Personal Data We Process

Depending on how you use ${name}, we may process:

- Account data (name, email address, login details)
- Usage data (feature usage, logs, device information)
- Payment data (billing details via third-party payment providers)
- Support data (messages, feedback, bug reports)

We do **not** intentionally collect special categories of personal data (e.g. health, religion, political opinions) via the Service.

## 3. Purposes and Legal Bases

We process personal data for the following purposes:

- Providing and operating the Service (performance of a contract, Art. 6(1)(b) GDPR)
- Improving and securing the Service (legitimate interests, Art. 6(1)(f) GDPR)
- Handling payments and invoicing (performance of a contract, legal obligations)
- Communicating with you about updates and support (performance of a contract / legitimate interests)

## 4. Data Retention

We retain personal data only for as long as necessary for the purposes described above or as required by law. We apply regular review and deletion routines.

## 5. International Transfers

If we transfer personal data outside the EU/EEA we will ensure appropriate safeguards such as Standard Contractual Clauses.

## 6. Your Rights

Under applicable data protection laws (including GDPR) you may have the right to:

- access your personal data
- rectify inaccurate data
- erase data in certain circumstances
- restrict or object to processing
- data portability
- lodge a complaint with a supervisory authority

To exercise your rights, contact [COMPANY_CONTACT_EMAIL].

## 7. Sub-processors and Third Parties

We may use carefully selected service providers for hosting, analytics, payments and communication. These providers act as data processors under a written agreement and may only process data on our instructions.

## 8. Security

We implement appropriate technical and organizational measures to protect personal data, including encryption in transit, access controls and secure development practices.

## 9. Cookies and Tracking

${name} may use cookies or similar technologies for essential functionality, analytics and improving the Service. Where required by law we will request your consent before using non-essential cookies.

## 10. Business Customers and Data Processing Agreements

If you use ${name} in a business context where you act as data controller, we may provide a separate Data Processing Agreement (DPA) that governs our processing of personal data on your behalf.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. The "Last updated" date at the top of this document will be revised accordingly.

## 12. Contact

If you have questions about this Privacy Policy or data protection at ${name}, contact [COMPANY_CONTACT_EMAIL].
`;
}

export async function ensureLegalCompliance(appId, spec = {}) {
  const appName = spec.product_name || spec.idea_title || appId || "[PRODUCT_NAME]";
  const legalDir = path.join(root, "apps", appId, "legal");
  const files = [];
  const missing = [];

  try {
    await fs.mkdir(legalDir, { recursive: true });
  } catch (e) {
    await log("error", "Failed to create legal directory", { appId, error: e.message });
    return { compliant: false, files: [], missing: ["legal_directory"] };
  }

  const tosPath = path.join(legalDir, "terms-of-service.md");
  const privacyPath = path.join(legalDir, "privacy-policy-gdpr.md");

  try {
    await fs.access(tosPath);
    files.push(tosPath);
  } catch {
    const tpl = buildTosTemplate(appName);
    try {
      await fs.writeFile(tosPath, tpl, "utf-8");
      files.push(tosPath);
    } catch (e) {
      missing.push("terms-of-service.md");
      await log("error", "Failed to write Terms of Service", { appId, error: e.message });
    }
  }

  try {
    await fs.access(privacyPath);
    files.push(privacyPath);
  } catch {
    const tpl = buildPrivacyTemplate(appName);
    try {
      await fs.writeFile(privacyPath, tpl, "utf-8");
      files.push(privacyPath);
    } catch (e) {
      missing.push("privacy-policy-gdpr.md");
      await log("error", "Failed to write Privacy Policy", { appId, error: e.message });
    }
  }

  const compliant = missing.length === 0;
  if (!compliant) {
    await log("warn", "Legal compliance incomplete for app", { appId, missing });
  } else {
    await log("info", "Legal compliance ensured for app", { appId, files });
  }

  return { compliant, files, missing };
}

# Security Policy

## Reporting a vulnerability

If you believe you've found a security vulnerability in fhir-client,
please **do not open a public issue**. Instead:

- Email: security@peerbits.com  <!-- TODO: confirm actual reporting address -->
- Or use GitHub's private vulnerability reporting: **Security -> Report a
  vulnerability** on this repo.

Please include:
- A description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept code if applicable)
- Any suggested remediation, if you have one

You should expect an acknowledgment within **3 business days**. We'll keep
you updated as we investigate and fix, and will credit you in the release
notes unless you'd prefer to stay anonymous.

## Supported versions

| Version | Supported |
|---|---|
| `1.x` (current: 1.0.0) | ✅ |
| < 1.0 (pre-release) | ❌ |

## What this repo does and does not contain

This is an open-source reference implementation maintained by Peerbits. It
is intended to be:

- **Spec-compliant** — grounded in the current published version of the
  relevant healthcare standard (see README §5 Architecture for the specific
  spec version this was built against).
- **Free of PHI** — no real patient data appears anywhere in this repo,
  including tests and examples. All example data is synthetic.
- **Free of production credentials** — any example configuration uses
  placeholder values only. Do not copy example values into a production
  deployment and assume they're safe.

This repo is **not** production-hardened token/credential storage out of
the box — see the README for the pluggable storage interface and the
expectation that consuming applications supply their own production-grade
backend.

## Scanning & dependency policy

- Dependabot is enabled on this repository for both npm and GitHub Actions
  dependencies (weekly).
- CodeQL static analysis runs on every push to `main` and every PR.
- Dependencies with a known critical/high CVE are patched or removed before
  the next tagged release; see `CHANGELOG.md` for disclosure of any that
  affected a released version.

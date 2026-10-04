# Security policy

## Supported versions

The latest supported release line receives security attention. Currently,
[v1.0.0-rc.1](https://github.com/Miskovy/pjs/releases/tag/v1.0.0-rc.1) is the
actively evaluated release candidate. It is a prerelease, not final v1.0.0.
Pre-1.0 releases do not carry a long-term security-support guarantee, and older
releases are not promised backported fixes.

## Report a vulnerability privately

**Do not open a public GitHub issue containing vulnerability details.** Do not
publish exploit details in pull requests, logs, or other public discussions.

When GitHub Private Vulnerability Reporting is available, open this repository's
**Security → Report a vulnerability** flow to submit a private report and
coordinate through a security advisory. Start at the
[repository Security page](https://github.com/Miskovy/pjs/security).

If that flow is not available, contact the project maintainer privately using the
private contact method available from the
[@Miskovy GitHub profile](https://github.com/Miskovy). Ask for a private reporting
channel rather than publishing exploit details.

Please provide:

- Affected PJS version and installation source.
- Node version, operating system, and architecture.
- Potential impact and any conditions needed to trigger it.
- Reproduction steps and a proof of concept if it is safe to share privately.
- A suggested mitigation, if known.

Remove unrelated secrets and personal information from attachments. Please allow
coordinated disclosure while the maintainer investigates and prepares a response.
PJS has one primary maintainer; there are no guaranteed response or fix deadlines.

## Relevant security subjects

Examples include worker task loading, module path handling, serialization,
transfer ownership, SharedArrayBuffer usage, resource exhaustion, queue or
backpressure bypass, worker lifecycle, unexpected code execution, and package
contents. These are areas worth examining, not claims of known vulnerabilities.

PJS loads trusted task modules; worker isolates are not a sandbox for untrusted
code. Include the trust boundary you believe was crossed in a report.
Ordinary functional bugs and performance questions belong in the
[support routes](SUPPORT.md) unless they involve a security impact.

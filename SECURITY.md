# Security policy

## Versions considered for triage

As checked on 23 October 2026, [v1.0.0-rc.4](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4)
is the published prerelease and [npm `latest` and `next`](https://registry.npmjs.org/@pjavascript%2fruntime)
both select it. It is the current published line for security triage. Identify
development builds by their commit; later source is not part of immutable RC4.
Pre-1.0 releases have no long-term security-support guarantee, and older releases
are not promised backported fixes.

## Report privately

Use [GitHub's private vulnerability reporting flow](https://github.com/Miskovy/parallel-javascript/security/advisories/new)
from **Security → Report a vulnerability**. Reporting was verified enabled on
23 October 2026. If the flow becomes unavailable, use the private contact method
available from [@Miskovy's profile](https://github.com/Miskovy) to request a private
channel. Do not put vulnerability or exploit details in public issues, pull
requests, discussions or logs.

Please include:

- Affected version or commit and installation source.
- Exact Node version, operating system and architecture.
- Potential impact, required conditions and a minimal private reproduction.
- A suggested mitigation, if known.

Remove unrelated secrets and personal information from code, logs and attachments.
Coordinate disclosure privately while the maintainer investigates and prepares a
response. PJS has one primary maintainer; response and fix deadlines are not
guaranteed.

## Execution boundary

PJS loads trusted application task modules with Node's filesystem, network and
process capabilities. Worker isolates are not a sandbox for untrusted code.
Explain the trust boundary involved in your report. Ordinary functional bugs
and performance questions belong in the [support routes](SUPPORT.md).

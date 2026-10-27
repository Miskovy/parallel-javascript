# Security policy

## Versions considered for triage

As checked on 23 October 2026, [v1.0.0-rc.4](https://github.com/Miskovy/parallel-javascript/releases/tag/v1.0.0-rc.4)
is the published prerelease and [npm `latest` and `next`](https://registry.npmjs.org/@pjavascript%2fruntime)
both select it. It is the current published line for security triage. Identify
development builds by their commit; later source is not part of immutable RC4.
Pre-1.0 releases have no long-term security-support guarantee, and older releases
are not promised backported fixes.

## Node runtime support

Development source requires Node `^22.23.4 || ^24.22.1 || ^26.12.1`, replacing
older patch floors and adding Node 26. These minimums match the
[October 2026 upstream security releases](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
and [official release index](https://nodejs.org/dist/index.json), checked on
26 October 2026. Use current patched releases within these majors; engine metadata
does not update a consumer's Node binary. Published RC4 and historical reports
retain their original metadata/results.

Node 26 is Current, with LTS scheduled for 28 October 2026. Node 22 and 24 are
Maintenance LTS. Node 20 reached upstream EOL on 30 April 2026, is unsupported by
PJS, and is not included in these upstream October fixes. See the
[official lifecycle schedule](https://github.com/nodejs/Release/blob/main/schedule.json)
and [PJS support policy](docs/stability.md#proposed-node-and-platform-policy).

## Report privately

Development browser execution uses trusted application ESM in dedicated module
workers, not an untrusted-code sandbox. Configure page worker-src and the worker
response's own CSP, URL/CORS/MIME rules and optional cross-origin-isolation headers;
see [browser deployment security](docs/guide/browser.md#deployment-security).
Endpoint revocation is not native exit confirmation and does not certify shared
backing safe to reuse. Published RC4 remains unchanged.

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

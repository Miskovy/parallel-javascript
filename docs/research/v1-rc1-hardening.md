# v1 RC1 hardening report

Source preparation from released v0.15.0 commit
`58a3ce056d8ef9b7cf6991a37fcc7fcffc018e7c`, initially clean Windows checkout.
v0.15.0 tag/release remain immutable. All baseline gates pass, including 184
individually counted runtime tests and actual package consumers/examples.

The [proposal](../proposal-v1.0.0-rc.1.md) preceded implementation. New bounded
contract tooling targets repetition, deterministic failure injection and lifecycle
pressure, not new features. No runtime source, public type, option, export or
semantic change. New tooling corrects its own npm path resolution for external
directories; this is not a runtime defect. Exact candidate source and fresh
qualification evidence will be recorded after its commit.

Node 22.13.0 portable official Windows x64 archive was SHA-256 verified:
`b0feb09ebf41328628e7383f7a092fb7342ce1e05c867a90cf8f1379205a8429`.
Minimum development build/types, all 184 contracts, installed JS/TS, six examples
and all-error RC smoke pass. Default Node 24.21.0, PATH and Balanced plan unchanged.
Actual environment will accompany candidate validation; hardware values are not
assumed. Existing Node 22.23.3 supplies the middle version matrix cell.

New source/declaration snapshots freeze all 38 root exports and every runtime
source/declaration file against v0.15.0. New package controls install into separate
external JS/TS projects, use paths with spaces and unrelated cwd, preserve ESM
export restrictions/source maps, and require natural exit. New CI pins the minimum
boundary on Linux and Windows and keeps extended profiles manual.

**Decision B at this boundary: candidate qualification pending; RC not released.**
This host performs Windows qualification and a precise Linux handoff. No fresh
Linux result is inferred from historical Fedora or CI configuration. macOS/ARM64
are NOT CLAIMED. Experimental methods/options remain experimental; stats remain
diagnostic. See [readiness](v1-rc1-readiness.md) and [soak report](v1-rc1-soak.md).

No @pjs/crypto/compression package, scheduler change, feature, RC2, final 1.0 or
npm publication. The post-RC observation plan is external installed-consumer use
and lifecycle/ownership incident reporting; RC2 requires a demonstrated fix.

"""Retain full evidence outside Git and a compact, replayable public trial view.

The compact archive keeps every trial record and top-level raw receipt. Only
duplicate per-child files and large deterministic oracle buffers are omitted;
their original manifest and the complete archive location/hash remain available.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--campaign", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--full-archive", type=Path, required=True)
    parser.add_argument("--host-observations", type=Path, required=True)
    parser.add_argument("--plot-lock", type=Path, required=True)
    args = parser.parse_args()
    campaign = args.campaign.resolve()
    full_archive = args.full_archive.resolve()
    assert not args.output.exists() and not full_archive.exists()
    scratch = Path(tempfile.mkdtemp(prefix="pjs-publication-package-"))
    bundle = scratch / "bundle"
    subprocess.run([sys.executable, str(Path(__file__).with_name("retain.py")),
                    "--raw", str(campaign), "--analysis", str(campaign / "analysis"),
                    "--graphics", str(campaign / "graphics"), "--output", str(bundle)], check=True)
    full_archive.parent.mkdir(parents=True, exist_ok=True)
    with full_archive.open("xb") as destination, (bundle / "smoke-raw.zip").open("rb") as source:
        shutil.copyfileobj(source, destination)
    args.output.mkdir(parents=True, exist_ok=False)
    for path in bundle.iterdir():
        if path.name in ("smoke-raw.zip", "ARTIFACTS.json"):
            continue
        if path.is_dir():
            shutil.copytree(path, args.output / path.name)
        else:
            shutil.copyfile(path, args.output / path.name)
    full_identity = {
        "kind": "Complete immutable campaign archive retained outside Git",
        "path": str(full_archive), "bytes": full_archive.stat().st_size,
        "sha256": sha256(full_archive), "root": campaign.name,
        "entries": "archive-entries.json",
        "reason": "Large oracle arrays and duplicate per-child receipts stay outside Git; trials.zip retains every trial and top-level receipt for public replay.",
    }
    write_json(args.output / "FULL-RAW.json", full_identity)
    compact = scratch / "trials"
    compact.mkdir()
    for path in (campaign / "raw").iterdir():
        if path.is_file():
            shutil.copyfile(path, compact / ("SOURCE-MANIFEST.json" if path.name == "manifest.json" else path.name))
    write_json(compact / "ORIGIN.json", {
        "kind": "Compact view of the immutable publication run; all 780 trial records retained",
        "sourceManifestSha256": sha256(campaign / "raw/manifest.json"),
        "completeArchive": full_identity,
        "omittedFromView": ["children/ (duplicate records already present in raw.jsonl)", "oracles/ (deterministic reference bytes; hashes retained in references.json and SOURCE-MANIFEST.json)"],
    })
    write_json(compact / "manifest.json", [{"path": p.name, "sha256": sha256(p)} for p in sorted(compact.iterdir())])
    with zipfile.ZipFile(args.output / "trials.zip", "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(compact.iterdir()):
            info = zipfile.ZipInfo("trials/" + path.name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    shutil.copyfile(args.host_observations, args.output / "host-observations.json")
    shutil.copyfile(args.plot_lock, args.output / "plot-environment.txt")
    write_json(args.output / "ARTIFACTS.json", [{
        "path": p.relative_to(args.output).as_posix(), "bytes": p.stat().st_size,
        "sha256": sha256(p),
    } for p in sorted(args.output.rglob("*")) if p.is_file()])
    print(json.dumps({"output": str(args.output), "completeArchive": full_identity,
                      "publicTrialArchiveBytes": (args.output / "trials.zip").stat().st_size}))


if __name__ == "__main__":
    main()

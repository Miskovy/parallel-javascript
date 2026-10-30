"""Bundle immutable raw runs and generated artifacts for a reviewable commit."""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(root):
    for item in json.loads((root / "manifest.json").read_text(encoding="utf-8")):
        assert digest(root / item["path"]) == item["sha256"], item["path"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", action="append", type=Path, required=True)
    parser.add_argument("--analysis", type=Path, required=True)
    parser.add_argument("--graphics", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    assert len({p.name for p in args.raw}) == len(args.raw)
    for root in args.raw:
        verify(root)
    data = json.loads((args.analysis / "summary.json").read_text(encoding="utf-8"))
    manifests = [p for root in args.raw for p in root.rglob("manifest.json")]
    assert any(digest(p) == data["rawManifestSha256"] for p in manifests)
    plot = json.loads((args.graphics / "plot-manifest.json").read_text(encoding="utf-8"))
    assert digest(args.analysis / "summary.json") == plot["inputSha256"]
    for name, sha in plot["files"].items():
        assert digest(args.graphics / name) == sha, name
    args.output.mkdir(parents=True, exist_ok=False)
    entries = []
    with zipfile.ZipFile(args.output / "smoke-raw.zip", "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for root in args.raw:
            for path in sorted(root.rglob("*")):
                if not path.is_file():
                    continue
                name = (Path(root.name) / path.relative_to(root)).as_posix()
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o644 << 16
                archive.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
                entries.append({"path": name, "bytes": path.stat().st_size, "sha256": digest(path)})
    (args.output / "archive-entries.json").write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    for name in ("summary.json", "REPORT.md", "results.csv"):
        shutil.copyfile(args.analysis / name, args.output / name)
    shutil.copytree(args.graphics, args.output / "graphics")
    (args.output / "environment.json").write_text(json.dumps(data["freeze"]["environment"], indent=2) + "\n", encoding="utf-8")
    (args.output / "packages.json").write_text(json.dumps(data["packages"], indent=2) + "\n", encoding="utf-8")
    artifacts = [{"path": p.relative_to(args.output).as_posix(), "bytes": p.stat().st_size, "sha256": digest(p)} for p in sorted(args.output.rglob("*")) if p.is_file()]
    (args.output / "ARTIFACTS.json").write_text(json.dumps(artifacts, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "rawFiles": len(entries), "archiveBytes": (args.output / "smoke-raw.zip").stat().st_size}))


if __name__ == "__main__":
    main()

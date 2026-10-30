"""Numerical charts from retained summary.json only. No hand-entered chart data."""
import argparse
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

NAMES = {"serial": "Serial JS", "raw": "Raw threads", "pjs": "PJS 1.0.0", "piscina": "Piscina 5.3.2", "tinypool": "Tinypool 2.2.0", "workerpool": "workerpool 10.0.3"}
COLORS = {"serial": "#6b7280", "raw": "#343e50", "pjs": "#147d92", "piscina": "#ba5b24", "tinypool": "#7654a3", "workerpool": "#6b832c"}


def label(spec):
    if spec["family"] == "monte":
        return f'{spec["count"]:,} paths'
    if spec["family"] == "image":
        return f'{spec["edge"]} × {spec["edge"]}\n{spec["mode"]}'
    return f'grain {spec["chunkSize"]:,}\nbatch {spec["batch"]}'


def draw(data, output, kind):
    order = data["freeze"]["config"]["contenders"]
    panels = [("monte", "Monte Carlo", "paths/s", 1), ("image", "JavaScript image stencil", "million pixels/s", 1e6), ("numerical", "Fine-grained numerical work", "million values/s", 1e6)]
    fig, axes = plt.subplots(3, 1, figsize=(14, 13.5))
    fig.patch.set_facecolor("#fafaf8")
    for ax, (family, title, unit, divisor) in zip(axes, panels):
        specs = [s for s in data["freeze"]["matrix"]["cases"] if s["family"] == family and s["study"] != "scaling"]
        x = np.arange(len(specs))
        width = 0.125
        for i, contender in enumerate(order):
            values, low, high, failed = [], [], [], []
            for spec in specs:
                row = next(r for r in data["rows"] if r["case"] == spec["id"] and r["contender"] == contender)
                metric = row["wallMs"] if kind == "throughput" else row["timerP95Ms"]
                if metric is None or row["status"] != "complete":
                    values.append(0); low.append(0); high.append(0); failed.append(True)
                    continue
                failed.append(False)
                if kind == "throughput":
                    v = spec["count"] * 1000 / metric["median"] / divisor
                    lower = spec["count"] * 1000 / metric["ci95"][1] / divisor
                    upper = spec["count"] * 1000 / metric["ci95"][0] / divisor
                else:
                    v, (lower, upper) = metric["median"], metric["ci95"]
                values.append(v); low.append(max(0, v-lower)); high.append(max(0, upper-v))
            positions = x + (i - (len(order)-1)/2) * width
            ax.bar(positions, values, width, color=COLORS[contender], label=NAMES[contender], yerr=np.array([low, high]), capsize=2, error_kw={"elinewidth": 0.8})
            for position, bad in zip(positions, failed):
                if bad:
                    ax.text(position, 0, "FAIL", rotation=90, fontsize=7, va="bottom", ha="center", color="#a32121")
        ax.set_title(title, loc="left", fontsize=14, weight="bold", pad=12)
        ax.set_xticks(x, [label(s) for s in specs], fontsize=10)
        ax.set_ylabel(unit if kind == "throughput" else "host timer drift p95 (ms)", fontsize=10)
        ax.set_ylim(bottom=0)
        ax.grid(axis="y", alpha=0.18); ax.set_axisbelow(True)
        ax.spines[["top", "right"]].set_visible(False)
        ax.set_facecolor("#fafaf8")
    title = "JavaScript worker pools: CPU throughput" if kind == "throughput" else "JavaScript worker pools: main-thread responsiveness"
    subtitle = "Higher is faster · dispatch + transport + required result collection included" if kind == "throughput" else "Lower drift is better · 10 ms armed/flushed host timer · short cases have sparse samples"
    fig.suptitle(title, fontsize=21, weight="bold", x=0.065, ha="left", y=0.982)
    fig.text(0.065, 0.948, subtitle, fontsize=11)
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, ncol=6, loc="upper center", bbox_to_anchor=(0.51, 0.935), frameon=False, fontsize=9)
    env = data["freeze"]["environment"]
    trials = data["freeze"]["trials"]
    foot = (f'{env["cpuModel"]} · {env["os"]}/{env["arch"]} · Node {data["packages"]["node"]["version"]} · {data["freeze"]["matrix"]["primary"]} workers · {trials} trials/cell\n'
            f'Medians; descriptive 95% bootstrap intervals (2,000 resamples). Preparation separate. Serial has identical logical chunking.\n'
            f'All primary and batching cases shown. Scaling and cold/RSS results: REPORT.md. Source {data["freeze"]["source"]["commit"][:12]}\n'
            'Reproduce: github.com/Miskovy/parallel-javascript → benchmarks/publication-v1/README.md')
    fig.text(0.065, 0.027, foot, fontsize=8.2, linespacing=1.65)
    if not data["publicationEligible"]:
        fig.text(0.5, 0.51, "SMOKE ONLY\nNOT PERFORMANCE EVIDENCE", fontsize=35, color="#a21f2d", alpha=0.20, weight="bold", rotation=20, ha="center", va="center")
        fig.text(0.065, 0.006, "Reduced correctness workloads · unverified managed-host conditions · no ranking or speed claims", color="#a21f2d", fontsize=10, weight="bold")
    fig.subplots_adjust(top=0.88, bottom=0.14, left=0.09, right=0.98, hspace=0.46)
    for suffix in ("png", "svg"):
        fig.savefig(output / f'{kind}.{suffix}', dpi=160, facecolor=fig.get_facecolor())
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("summary", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    data = json.loads(args.summary.read_text(encoding="utf-8"))
    plt.rcParams.update({"font.family": "DejaVu Sans", "svg.fonttype": "none", "axes.formatter.useoffset": False})
    draw(data, args.output, "throughput")
    draw(data, args.output, "responsiveness")
    metadata = {"inputSha256": hashlib.sha256(args.summary.read_bytes()).hexdigest(), "matplotlib": matplotlib.__version__, "numpy": np.__version__, "publicationEligible": data["publicationEligible"], "files": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in args.output.iterdir() if p.is_file()}}
    (args.output / "plot-manifest.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

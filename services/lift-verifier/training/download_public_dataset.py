"""Download the public ProjektCiezary plate dataset from Roboflow Universe.

Roboflow requires an API key even for public dataset exports. Set ROBOFLOW_API_KEY
in the environment; never commit the key or put it in source control.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("dataset-projektciezary"))
    parser.add_argument("--version", type=int, default=10)
    args = parser.parse_args()

    api_key = os.environ.get("ROBOFLOW_API_KEY", "").strip()
    if not api_key:
        parser.error("Set ROBOFLOW_API_KEY in your environment; do not paste it into code or commit it.")

    from roboflow import Roboflow

    rf = Roboflow(api_key=api_key)
    project = rf.workspace("projektciezary").project("weightlifting-plates")
    version = project.version(args.version)
    dataset = version.download("coco", location=str(args.output.resolve()))
    print(f"Downloaded dataset to: {dataset.location}")
    print("Next: inspect class labels and split leakage, then run validate_dataset before training.")


if __name__ == "__main__":
    main()

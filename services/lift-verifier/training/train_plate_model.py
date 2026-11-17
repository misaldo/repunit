"""Fine-tune RF-DETR Small for mass-labelled individual weight plates.

Dataset must be COCO detection format:
  dataset/{train,valid,test}/_annotations.coco.json
Images must show individual physical plates, not only an aggregate stack.
Keep all frames from the same source video/session in one split to prevent leakage.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

MASS_CLASS = re.compile(r"^(?:0[.,]5|1|1[.,]5|2|2[.,]5|5|10|15|20|25)\s*kg$", re.I)


def validate_dataset(root: Path) -> dict[str, list[str]]:
    summary: dict[str, list[str]] = {}
    for split in ("train", "valid", "test"):
        folder = root / split
        annotation = folder / "_annotations.coco.json"
        if not annotation.is_file():
            raise FileNotFoundError(f"Missing COCO annotations: {annotation}")
        data = json.loads(annotation.read_text(encoding="utf-8"))
        categories = [str(item.get("name", "")).strip() for item in data.get("categories", [])]
        mass_classes = [name for name in categories if MASS_CLASS.fullmatch(name)]
        if not mass_classes:
            raise ValueError(
                f"{split}: no per-plate mass classes found. "
                "A generic 'plate' or 'plate_stack' class cannot calculate kilograms."
            )
        image_names = {str(item.get("file_name", "")) for item in data.get("images", [])}
        missing = [name for name in image_names if not (folder / name).is_file()]
        if missing:
            raise FileNotFoundError(f"{split}: {len(missing)} referenced image(s) are missing")
        summary[split] = mass_classes
        print(f"{split}: {len(image_names)} images; mass classes={', '.join(mass_classes)}")
    if set(summary["train"]) != set(summary["valid"]):
        raise ValueError("train and valid must contain the same mass-labelled classes")
    if set(summary["train"]) != set(summary["test"]):
        raise ValueError("train and test must contain the same mass-labelled classes")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("runs/repunit-plates"))
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--grad-accum-steps", type=int, default=4)
    parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    args = parser.parse_args()

    validate_dataset(args.dataset)
    if args.epochs < 1 or args.batch_size < 1 or args.grad_accum_steps < 1:
        parser.error("epochs, batch-size and grad-accum-steps must be positive")

    from rfdetr import RFDETRSmall

    model = RFDETRSmall()
    args.output.mkdir(parents=True, exist_ok=True)
    model.train(
        dataset_dir=str(args.dataset.resolve()),
        epochs=args.epochs,
        batch_size=args.batch_size,
        grad_accum_steps=args.grad_accum_steps,
        output_dir=str(args.output.resolve()),
        accelerator=args.device,
        early_stopping=True,
        log_per_class_metrics=True,
    )
    print(f"Training finished. Inspect validation metrics and test checkpoint in: {args.output}")


if __name__ == "__main__":
    main()

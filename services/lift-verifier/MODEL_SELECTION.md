# REPUNIT automatic barbell-load recognition: model decision

Status: research decision and implementation specification. This is NOT a trained or production-ready load recognizer.

## Decision

Do not replace OWLv2 with another generic zero-shot detector and call the problem solved. A detector can locate likely plates, but it cannot establish the mass of every plate, prove that hidden plates are absent, or determine the bar's mass.

The recommended long-term stack is:

1. **RF-DETR Small (Apache-2.0) fine-tuned on REPUNIT plate imagery** as the primary detector/instance segmenter. Train classes for plate instances and, where useful, plate families/marking regions. The pretrained COCO checkpoint is only an initialization; it is not a plate detector until fine-tuned on labelled gym footage.
2. **PaddleOCR PP-OCRv5/PP-OCRv6** for reading visible numeric markings on detected plate crops. OCR output is evidence, not a load value by itself; normalize only supported markings and preserve per-crop confidence.
3. **Temporal association across video frames** so the same physical plate is not counted repeatedly. Use track identity and per-frame evidence aggregation rather than summing detections across frames.
4. **Load reconstruction with explicit completeness checks**: identify every plate on both sleeves, distinguish overlapping/hidden plates, apply a known bar type/mass only when the bar is identifiable or explicitly configured, and account for collars only if REPUNIT's rules define them as load.
5. **Conservative decision gate**: return a numeric total only when both sleeves and all plates are sufficiently observed and the evidence is internally consistent. Otherwise return UNKNOWN / NEEDS_REVIEW. Never infer the far side by symmetry or assume a 20 kg bar.

## Why this stack

- RF-DETR is designed for fine-tuning and supports detection/instance segmentation. Its Nano–Large checkpoints and package are Apache-2.0, suitable for commercial use subject to retaining notices. Official project: https://github.com/roboflow/rf-detr
- RF-DETR Small is the practical initial size; move to Medium/Large only if evaluation shows a measurable accuracy gain worth the compute cost.
- PaddleOCR's current documentation provides PP-OCRv5 and PP-OCRv6 detection/recognition pipelines and local inference options. Official docs: https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html
- Generic open-vocabulary models such as OWLv2 or Grounding DINO can help bootstrap annotations or provide fallback detections, but zero-shot boxes are not calibrated mass measurements and should not be used to auto-approve a lift.

## Required data before training

Collect user-consented, labelled videos and frame crops covering:
- different brands, colours, diameters, calibrated plate types and printed/embossed markings;
- one or both sleeves visible, partial occlusion, stacked plates, collars, racks and background clutter;
- front, side and oblique camera positions, different distances, lighting and video quality;
- different bar types and explicitly recorded bar masses;
- both matching and deliberately mismatching declared loads.

Labels must include per-instance plate boxes/masks, plate identity across frames where possible, readable marking text or verified plate mass, both-sleeve completeness/visibility, bar type/mass, and verified total load. Split by recording/session/gym/equipment, not random adjacent frames, to avoid leakage.

## Evaluation gates before enabling automatic weight matching

Report plate-instance precision/recall, OCR exact-match rate on markings, per-video total-load exact-match and tolerance accuracy, false-accept rate, false-reject rate, and the fraction of videos safely abstained. Evaluate on a held-out set of unseen sessions/equipment. Do not enable automatic approval based only on COCO mAP or a few successful demos.

## Current implementation status

The current REPUNIT worker uses OWLv2 only for diagnostic candidate boxes. Its weight-reading functions deliberately return UNKNOWN, so total load is not automatically recognized. This is safer than fabricated kilograms. The proposed RF-DETR model has not been trained on REPUNIT plate data and must not be represented as integrated or validated yet.

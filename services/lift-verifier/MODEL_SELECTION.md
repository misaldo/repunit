# REPUNIT automatic barbell-load recognition

Status: research decision and implementation specification. This is NOT a trained or production-ready load recognizer.

## Selected candidate stack

1. **RF-DETR Small public weightlifting-plate checkpoint** as an experimental plate detector, with further REPUNIT-specific evaluation/fine-tuning required. Generic COCO weights are not a plate detector.
2. **PaddleOCR 3.x** for reading visible markings inside detected plate crops. OCR is supporting evidence, not a total-load measurement.
3. **Temporal tracking** to associate the same physical plate across frames so repeated observations are never counted as additional plates.
4. **Load reconstruction** only after every physical plate on both sleeves is accounted for, the standard 20 kg bar is added, and observations are consistent.
5. **Fail-closed decision**: if any sleeve, plate, marking, or plate/sleeve evidence is incomplete, return UNKNOWN and keep the lift NOT_VERIFIED.

The standard bar is always 20 kg in REPUNIT and is not AI-detected. Never infer the far sleeve by symmetry or sum detections across frames.

## Current code status

The worker contains an RF-DETR Small inference adapter and PaddleOCR crop-reading adapter. It now defaults to the public `Prithv122/custom-detector` checkpoint pinned to immutable revision `be16623ab1de46cc2e2b9e4df477af5d71d04c58` and verifies the published SHA-256 before loading. A local checkpoint can override it through `REPUNIT_PLATE_MODEL_PATH`. The public checkpoint is community-trained, not trained specifically for REPUNIT.

The adapter currently returns per-frame candidate boxes and OCR observations only. It recognizes the public checkpoint's mass-named classes (for example `10kg`) and excludes its collar class. It explicitly reports no total load, no unique physical plate count, no proof that both sleeves are complete, and no known bar mass. The production worker therefore cannot verify submitted weight yet. This is intentional fail-closed behavior, not a completed recognizer.

The pose-angle repetition counter is also a screening heuristic, not a validated competition judge. It needs independent video evaluation before being trusted for competition results.

## Public checkpoint and datasets

An already fine-tuned community checkpoint is available: [Prithv122/custom-detector](https://huggingface.co/Prithv122/custom-detector), released under Apache-2.0. It is trained on the ProjektCiezary dataset below. The author reports RF-DETR-S and a held-out-date mAP@50–95 of 0.741 for an earlier run, but the shipped 2A checkpoint's test date was used during error diagnosis; it has no clean new-day score. It still misread 25 of 100 known 1.5 kg plates as 0.5 kg in that diagnosed test. It covers side-on close-ups of one sleeve, not complete bars or gym videos. Therefore it is an experimental candidate only, never proof of total load. The loader pins its immutable revision and SHA-256 and uses safe deserialization; it deliberately does not enable unsafe pickle loading automatically. If safe loading fails, the detector remains unavailable.

Additional public datasets:

- [Weightlifting Plates by ProjektCiezary](https://universe.roboflow.com/projektciezary/weightlifting-plates): 2,251 images, 11 classes including individual plate masses from 0.5 kg to 25 kg, listed as CC BY 4.0. Its published model reports only 52.0% mAP@50, 63.4% precision and 47.4% recall. This is a useful candidate source for pretraining/annotation experiments, not an acceptable production checkpoint.
- [Plate Detection by Personal](https://universe.roboflow.com/personal-4yjis/plate-detection-xvycd): 659 images, two classes (visible plate and plate stack), listed as CC BY 4.0. Its description says it covers only three barbell exercises and prominent fully visible plates; its plate_stack class groups a stack on one side and does not account for perspective. Its reported model metrics do not establish complete-load accuracy.

Before importing either dataset, preserve attribution and license metadata, inspect the actual images/labels, remove duplicates, and split by source/session. The stack dataset cannot teach per-plate mass when its annotation groups the stack as one object. Public images and the public checkpoint are a starting point only; REPUNIT still needs representative full-lift validation footage from the gym environments and camera angles it will support. Since the user cannot supply private footage, any future validation must use appropriately licensed public full-lift videos with ground-truth load labels, or a separately consented evaluation partner.

## Data required before training

Collect user-consented, labelled full-lift videos and frame annotations covering:
- multiple plate brands, colours, sizes, calibrated masses and marking styles;
- single and stacked plates, overlapping edges, collars, racks and background clutter;
- front, side and oblique camera views, varied distance, lighting and video quality;
- both sleeves visible, one sleeve hidden, partial occlusion and genuinely ambiguous footage;
- different bar types with independently confirmed bar masses;
- correct and deliberately incorrect user-declared loads and rep counts.

For each physical plate, annotate a bounding box or mask, its identity across frames, visible marking text, and verified mass. Separately label sleeve visibility/completeness, bar type/mass, declared values, ground-truth values and whether the whole lift is valid. Split train/validation/test by recording session, gym and equipment—not by adjacent frames from the same video.

Do not commit private gym videos or identifying data to GitHub. Store media in a restricted location with explicit participant consent and use pseudonymous IDs in manifests.

## Evaluation gates

Use the offline harness in `services/lift-verifier/evaluation/` to compare candidates on identical clips. Report:
- plate-instance precision and recall;
- marking OCR exact-match rate;
- total-load exact accuracy and accuracy within ±2.5 kg;
- exact rep accuracy and joint reps+weight accuracy;
- false-VERIFIED rate on invalid or ambiguous clips;
- valid-lift recall, abstention rate, latency and operating cost.

Hold out entire recording sessions and equipment combinations. Do not enable automatic weight matching based on detector mAP, confidence scores alone, or a handful of successful demos. No production accuracy claim is justified until this evaluation has been run on a representative labelled set.

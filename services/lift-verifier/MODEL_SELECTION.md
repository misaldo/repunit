# REPUNIT automatic barbell-load recognition

Status: research decision and implementation specification. This is NOT a trained or production-ready load recognizer.

## Selected candidate stack

1. **RF-DETR Small fine-tuned on REPUNIT plate imagery** for plate-instance detection. Generic COCO weights are not a REPUNIT plate detector and must not be used to infer load.
2. **PaddleOCR 3.x** for reading visible markings inside detected plate crops. OCR is supporting evidence, not a total-load measurement.
3. **Temporal tracking** to associate the same physical plate across frames so repeated observations are never counted as additional plates.
4. **Load reconstruction** only after every physical plate on both sleeves is accounted for, the bar type and mass are known, and observations are consistent.
5. **Fail-closed decision**: if any sleeve, plate, marking, or bar-mass evidence is incomplete, return UNKNOWN and keep the lift NOT_VERIFIED.

Never infer the far sleeve by symmetry, never assume a 20 kg bar, and never sum detections across frames.

## Current code status

The worker contains an RF-DETR Small inference adapter and PaddleOCR crop-reading adapter. They require a custom checkpoint configured through `REPUNIT_PLATE_MODEL_PATH`. The repository does not contain a trained REPUNIT checkpoint or a labelled gym-plate dataset.

The adapter currently returns per-frame candidate boxes and OCR observations only. It explicitly reports no total load, no unique physical plate count, no proof that both sleeves are complete, and no known bar mass. The production worker therefore cannot verify submitted weight yet. This is intentional fail-closed behavior, not a completed recognizer.

The pose-angle repetition counter is also a screening heuristic, not a validated competition judge. It needs independent video evaluation before being trusted for competition results.

## Public datasets found for bootstrapping

Two public Roboflow Universe datasets may help bootstrap a detector, but neither is sufficient evidence for production load reconstruction:

- [Weightlifting Plates by ProjektCiezary](https://universe.roboflow.com/projektciezary/weightlifting-plates): 2,251 images, 11 classes including individual plate masses from 0.5 kg to 25 kg, listed as CC BY 4.0. Its published model reports only 52.0% mAP@50, 63.4% precision and 47.4% recall. This is a useful candidate source for pretraining/annotation experiments, not an acceptable production checkpoint.
- [Plate Detection by Personal](https://universe.roboflow.com/personal-4yjis/plate-detection-xvycd): 659 images, two classes (visible plate and plate stack), listed as CC BY 4.0. Its description says it covers only three barbell exercises and prominent fully visible plates; its plate_stack class groups a stack on one side and does not account for perspective. Its reported model metrics do not establish complete-load accuracy.

Before importing either dataset, preserve attribution and license metadata, inspect the actual images/labels, remove duplicates, and split by source/session. The stack dataset cannot teach per-plate mass when its annotation groups the stack as one object. Public images should be treated as a starting point; REPUNIT still needs consented footage from the actual gym environments and camera angles it will support.

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

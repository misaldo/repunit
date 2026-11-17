# REPUNIT plate model training

This folder contains the repeatable fine-tuning entry point for RF-DETR Small.
It does **not** claim that a model has been trained. A real run requires an
annotated dataset and a CUDA-capable training machine (or managed GPU training).

## Required data

Use COCO detection exports with this structure:

```
dataset/
  train/_annotations.coco.json + images
  valid/_annotations.coco.json + images
  test/_annotations.coco.json + images
```

Every physical plate must have its own bounding box and a mass class (for
example `1.25 kg`, `2.5 kg`, `5 kg`, `10 kg`, `15 kg`, `20 kg`, `25 kg`).
A generic `plate_stack` label is not enough to calculate total load. Include
both near-side and far-side views, different gyms, lighting, camera angles,
occlusions, bumper/iron plates and overlapping stacks. Keep source videos
strictly separated between train/valid/test; adjacent frames must never leak
across splits.

Public starting datasets:
- [ProjektCiezary Weightlifting Plates](https://universe.roboflow.com/projektciezary/weightlifting-plates)
  (mass-labelled individual plate classes; CC BY 4.0; dataset/model metrics are
  not a REPUNIT validation).
- [Personal Plate Detection](https://universe.roboflow.com/personal-4yjis/plate-detection-xvycd)
  (plate and plate_stack labels; useful for plate-region pretraining, but stack
  labels alone cannot provide individual plate masses; CC BY 4.0).

The public datasets do not establish full-bar completeness. Before a production
release, add appropriately licensed full-bar images/videos with independently
verified per-plate annotations. Do not scrape videos without checking rights.

## Download the public dataset

Roboflow requires an API key for public dataset exports. Create a free Roboflow
account, copy the API key from the account settings, and set it locally as an
environment variable (do not send it in chat or commit it):

```powershell
$env:ROBOFLOW_API_KEY = "YOUR_KEY"
python download_public_dataset.py --version 10
```

The downloader fetches ProjektCiezary's public `weightlifting-plates` v10
dataset in COCO format. This dataset is only a starting point: it is not a
full-bar/two-sleeve video dataset and cannot by itself validate total-load
recognition. The training script deliberately checks that mass-labelled
categories exist.

## Train

Install the training extra for the pinned RF-DETR version in the worker's
training environment, then run:

```bash
python train_plate_model.py --dataset ./dataset-projektciezary --output ./runs/repunit-plates --epochs 100 --batch-size 4 --device cuda
```

The script checks COCO annotations, image files and mass-labelled categories
before starting RF-DETR Small fine-tuning. It writes checkpoints and metrics
under the output directory. A training run is not acceptance: evaluate once on
the untouched test split and report per-class AP, recall, false plate counts,
and exact total-load accuracy on complete two-sleeve examples.

## REPUNIT acceptance gates

A model checkpoint must not be deployed just because training completed.
Required evaluation includes:
- exact physical-plate count per sleeve (not detections summed across frames);
- correct mass class for every visible plate;
- temporal identity association so the same physical plate is counted once;
- both sleeves proven visible and complete; never infer the far side by symmetry;
- total load = fixed 20 kg standard bar + all left-side plates + all right-side plates;
- exact total-load accuracy and false-VERIFIED rate reported on held-out full-lift videos.

If either sleeve is hidden, clipped, ambiguous or not completely observed, total
load remains unknown and the lift must not be VERIFIED. The current worker still
does not implement this complete video-level counting pipeline.

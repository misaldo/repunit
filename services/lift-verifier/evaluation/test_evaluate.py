import tempfile
import unittest
from pathlib import Path
from evaluate import evaluate, load_labels, load_predictions

class EvaluationTests(unittest.TestCase):
    def setUp(self):
        self.labels = {
            "valid": {"declared_reps": 5, "declared_weight_kg": 100.0,
                      "ground_truth_reps": 5, "ground_truth_weight_kg": 100.0,
                      "is_valid": True},
            "invalid": {"declared_reps": 3, "declared_weight_kg": 120.0,
                        "ground_truth_reps": 2, "ground_truth_weight_kg": 100.0,
                        "is_valid": False},
        }

    def pred(self, reps=5, weight=100.0, rc=0.99, wc=0.99, proposed=True):
        return {"predicted_reps": reps, "predicted_weight_kg": weight,
                "reps_confidence": rc, "weight_confidence": wc,
                "proposed_verified": proposed}

    def test_confidence_below_threshold_blocks_verification(self):
        result = evaluate(self.labels, {"valid": self.pred(wc=0.89)})
        self.assertEqual(result["predicted_verified"], 0)

    def test_false_verification_is_counted(self):
        result = evaluate(self.labels, {"invalid": self.pred(reps=3, weight=120)})
        self.assertEqual(result["false_verify_count"], 1)
        self.assertEqual(result["false_verify_rate_on_invalid"], 1.0)

    def test_valid_prediction_passes_gate(self):
        result = evaluate(self.labels, {"valid": self.pred(weight=102.5)})
        self.assertEqual(result["predicted_verified"], 1)
        self.assertEqual(result["verified_precision"], 1.0)

    def test_unknown_video_id_fails(self):
        with self.assertRaisesRegex(ValueError, "Unknown video_id"):
            evaluate(self.labels, {"unknown": self.pred()})

    def test_csv_and_jsonl_loaders(self):
        with tempfile.TemporaryDirectory() as directory:
            labels = Path(directory) / "labels.csv"
            labels.write_text("video_id,exercise,declared_reps,declared_weight_kg,ground_truth_reps,ground_truth_weight_kg,is_valid\nv1,bench,5,100,5,100,true\n", encoding="utf-8")
            predictions = Path(directory) / "predictions.jsonl"
            predictions.write_text('{"model":"m1","video_id":"v1","predicted_reps":5,"predicted_weight_kg":100,"reps_confidence":0.99,"weight_confidence":0.99,"proposed_verified":true}\n', encoding="utf-8")
            self.assertIn("v1", load_labels(labels))
            self.assertIn("m1", load_predictions(predictions))

if __name__ == "__main__":
    unittest.main()

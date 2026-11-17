import unittest

from signal_logic import count_angle_cycles, decide_lift_status, is_verified_duplicate, stable_plate_load


class SignalLogicTests(unittest.TestCase):
    def test_only_previously_verified_lifts_block_video_reuse(self):
        self.assertTrue(is_verified_duplicate("VERIFIED"))
        for status in ("NOT_VERIFIED", "NEEDS_REVIEW", "REJECTED", "PENDING", None):
            self.assertFalse(is_verified_duplicate(status))

    def test_verification_requires_matching_reps_weight_and_complete_barbell_evidence(self):
        self.assertEqual(
            decide_lift_status(True, True, weight_evidence_complete=True),
            "VERIFIED",
        )

    def test_matching_ocr_without_complete_barbell_evidence_is_not_verified(self):
        self.assertEqual(decide_lift_status(True, True), "NOT_VERIFIED")
        self.assertEqual(
            decide_lift_status(True, True, weight_evidence_complete=False),
            "NOT_VERIFIED",
        )

    def test_every_mismatch_or_unknown_result_is_not_verified(self):
        cases = (
            (False, True, True),
            (True, False, True),
            (None, True, True),
            (True, None, True),
            (None, None, False),
        )
        for reps_match, weight_match, complete in cases:
            with self.subTest(reps_match=reps_match, weight_match=weight_match, complete=complete):
                self.assertEqual(
                    decide_lift_status(
                        reps_match,
                        weight_match,
                        weight_evidence_complete=complete,
                    ),
                    "NOT_VERIFIED",
                )

    def test_stationary_or_low_motion_is_unknown_not_zero_reps(self):
        self.assertIsNone(count_angle_cycles([120.0] * 30))
        self.assertIsNone(count_angle_cycles([120.0 + (i % 2) for i in range(30)]))

    def test_complete_cycles_are_counted(self):
        signal = [80, 82, 90, 110, 135, 155, 160, 145, 110, 85] * 3
        self.assertEqual(count_angle_cycles(signal, min_amplitude=25, min_separation=5), 3)

    def test_partial_cycle_is_not_counted(self):
        self.assertIsNone(count_angle_cycles([160, 145, 110, 85, 82, 80, 82, 85, 90, 92, 94, 95]))

    def test_single_plate_reading_is_not_a_total_load(self):
        self.assertIsNone(stable_plate_load([30.0]))
        self.assertIsNone(stable_plate_load([30.0, 60.0]))

    def test_consistent_repeated_readings_are_retained_as_candidates_only(self):
        self.assertEqual(stable_plate_load([60.0, 60.0, 60.0]), 60.0)


if __name__ == "__main__":
    unittest.main()

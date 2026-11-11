import unittest

from signal_logic import count_angle_cycles, decide_lift_status, is_verified_duplicate, stable_plate_load


class SignalLogicTests(unittest.TestCase):
    def test_only_previously_verified_lifts_block_video_reuse(self):
        self.assertTrue(is_verified_duplicate("VERIFIED"))
        self.assertFalse(is_verified_duplicate("NEEDS_REVIEW"))
        self.assertFalse(is_verified_duplicate("REJECTED"))
        self.assertFalse(is_verified_duplicate("PENDING"))
        self.assertFalse(is_verified_duplicate(None))

    def test_uncertain_evidence_is_never_automatically_verified(self):
        self.assertEqual(decide_lift_status(True, True), "VERIFIED")
        self.assertEqual(decide_lift_status(False, True), "REJECTED")
        self.assertEqual(decide_lift_status(True, False), "NEEDS_REVIEW")
        self.assertEqual(decide_lift_status(True, None), "NEEDS_REVIEW")
        self.assertEqual(decide_lift_status(None, None), "NEEDS_REVIEW")

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

    def test_consistent_repeated_readings_are_retained(self):
        self.assertEqual(stable_plate_load([60.0, 60.0, 60.0]), 60.0)


if __name__ == "__main__":
    unittest.main()

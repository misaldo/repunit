import unittest

from visual_plate_model import _is_plate_class


class PublicCheckpointClassTests(unittest.TestCase):
    def test_mass_named_plate_classes_are_recognized(self):
        for name in ("0.5kg", "1kg", "1.5kg", "2kg", "2.5kg", "5kg", "10kg", "15kg", "20kg", "25kg"):
            with self.subTest(name=name):
                self.assertTrue(_is_plate_class(name, set()))

    def test_collar_is_not_a_weight_plate(self):
        self.assertFalse(_is_plate_class("zacisk", set()))
        self.assertFalse(_is_plate_class("collar", set()))

    def test_unknown_class_is_not_a_plate(self):
        self.assertFalse(_is_plate_class("person", set()))


if __name__ == "__main__":
    unittest.main()

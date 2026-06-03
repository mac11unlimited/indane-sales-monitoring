from datetime import date

from app.services.lpg import extract_document_fields, manual_erv_number, match_status


def test_match_status_green_red_pending():
    assert match_status(100, 100) == "GREEN"
    assert match_status(100, 98) == "RED"
    assert match_status(0, 0) == "PENDING"


def test_manual_erv_number_format():
    assert manual_erv_number(date(2026, 5, 28), 7) == "MERV-20260528-0007"


def test_extract_document_fields_from_text_payload():
    payload = b"Invoice 7006702088 Truck UP14AB1234 Material M00087 Quantity 360 Amount 1000"
    result = extract_document_fields("invoice.txt", payload)
    assert result["truck_number"] == "UP14AB1234"
    assert result["material_code"] == "M00087"
    assert result["quantity"] == 360
    assert result["status"] == "EXTRACTED"

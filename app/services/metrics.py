import calendar
import math
from datetime import date, timedelta

CYLINDER_KG = 14.2
CYLINDER_MT = 0.0142
LOAD_CYLINDERS = 360
LOAD_MT = 5.112


def kg_to_cylinders(kg: float) -> int:
    return max(0, math.ceil(float(kg) / CYLINDER_KG))


def mt_to_cylinders(mt: float) -> int:
    return max(0, math.ceil(float(mt) / CYLINDER_MT))


def cylinders_to_loads(cylinders: int) -> int:
    return max(0, math.ceil(cylinders / LOAD_CYLINDERS))


def loads_to_cylinders(loads: int) -> int:
    return max(0, loads * LOAD_CYLINDERS)


def active_working_days(year: int, month: int, holidays: set[date] | None = None) -> list[date]:
    holidays = holidays or set()
    days = []
    for day in range(1, calendar.monthrange(year, month)[1] + 1):
        candidate = date(year, month, day)
        if candidate.weekday() != 6 and candidate not in holidays:
            days.append(candidate)
    return days


def elapsed_working_days(today: date, holidays: set[date] | None = None) -> int:
    return len([day for day in active_working_days(today.year, today.month, holidays) if day <= today])


def daily_baseline_cylinders(last_year_month_mt: float, growth_target_pct: float, working_days: int) -> int:
    if working_days <= 0:
        return 0
    adjusted = float(last_year_month_mt) * (1 + (float(growth_target_pct) / 100))
    return math.ceil(adjusted / (CYLINDER_MT * working_days))


def next_operating_day(start: date, holidays: set[date] | None = None) -> date:
    holidays = holidays or set()
    candidate = start + timedelta(days=1)
    while candidate.weekday() == 6 or candidate in holidays:
        candidate += timedelta(days=1)
    return candidate

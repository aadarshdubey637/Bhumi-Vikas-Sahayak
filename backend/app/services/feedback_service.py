FEEDBACK_CATEGORIES = ("incorrect_answer", "incorrect_citation", "outdated_rule", "incorrect_calculation", "missing_information", "other")


def validate_category(category: str) -> str:
    if category not in FEEDBACK_CATEGORIES:
        raise ValueError(f"category must be one of {FEEDBACK_CATEGORIES}")
    return category

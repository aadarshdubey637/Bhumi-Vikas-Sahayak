from app.rag.query import detect_language  # noqa: F401  (re-export)

TEMPLATES = {
    "en": {
        "not_established": "The ingested Madhya Pradesh Bhumi Vikas Rules text does not establish an answer to this question. No matching provision was found, so no answer is given.",
        "pointer": "Most relevant provisions found (text below is quoted from the source, untranslated):",
        "pending": "These provisions have not been human-verified, so this is a pointer to the rule, not a confirmed answer. The clerk decides.",
        "no_data": "No rule data has been ingested yet. Run the ingestion script (see README).",
        "needs_input": "More information is needed to evaluate this.",
        "clerk_decides": "This points to the rule; the clerk decides. Not an official approval.",
    },
    "hi": {
        "not_established": "उपलब्ध मध्य प्रदेश भूमि विकास नियमों के पाठ में इस प्रश्न का उत्तर स्थापित नहीं होता। कोई संबंधित प्रावधान नहीं मिला, इसलिए उत्तर नहीं दिया जा रहा है।",
        "pointer": "सबसे संबंधित प्रावधान (नीचे का पाठ स्रोत से अनूदित किए बिना उद्धृत है):",
        "pending": "इन प्रावधानों का मानव-सत्यापन नहीं हुआ है, इसलिए यह नियम की ओर संकेत है, पुष्ट उत्तर नहीं। निर्णय लिपिक का है।",
        "no_data": "अभी तक कोई नियम डेटा लोड नहीं हुआ है। README में दिया गया इन्जेस्ट स्क्रिप्ट चलाएँ।",
        "needs_input": "इसका मूल्यांकन करने के लिए और जानकारी चाहिए।",
        "clerk_decides": "यह नियम की ओर संकेत है; निर्णय लिपिक का है। यह आधिकारिक स्वीकृति नहीं है।",
    },
}


def template(language: str, key: str) -> str:
    return TEMPLATES["hi" if language in ("hi", "hi-en") else "en"][key]

"""Hindi / English wording for the channels. Pure functions, no I/O.

Rule: every rule number, title, page, number and quotation in an outgoing message comes from a ``Citation`` (stored rule text) or from
the user's own facts. The templates here contain no legal content, only framing, status wording and the safety statements
(AI assistant, not an official decision).
"""
from __future__ import annotations

import re

from app.channels.answering import ChannelAnswer, Citation

WA_MAX = 3800  # WhatsApp text limit is 4096 characters; stay well under it

NAME = {"en": "Rule Dost", "hi": "रूल दोस्त"}
VOICE_NAME = {"en": "Nirmaan Helpline", "hi": "निर्माण हेल्पलाइन"}

FACT_LABEL = {
    "en": {"plot_area": "plot area", "road_width": "road width", "building_height": "building height", "plot_length": "plot length",
           "plot_width": "plot width", "floors": "floors", "building_use": "building use", "area": "area"},
    "hi": {"plot_area": "प्लॉट का क्षेत्रफल", "road_width": "सड़क की चौड़ाई", "building_height": "इमारत की ऊँचाई", "plot_length": "प्लॉट की लंबाई",
           "plot_width": "प्लॉट की चौड़ाई", "floors": "मंज़िलें", "building_use": "भवन का उपयोग", "area": "क्षेत्रफल"},
}
UNIT_LABEL = {"en": {"m": "m", "sqm": "sq m", "ft": "ft", "sqft": "sq ft"}, "hi": {"m": "मीटर", "sqm": "वर्ग मीटर", "ft": "फुट", "sqft": "वर्ग फुट"}}

FOLLOW_UP = {
    "en": {"plot_area": "What is the area of your plot? (in sq m or sq ft, e.g. 150 sq m)",
           "road_width": "How wide is the road in front of your plot? (in metres, e.g. 9)",
           "building_height": "How tall will the building be? (in metres, e.g. 9)"},
    "hi": {"plot_area": "आपके प्लॉट का क्षेत्रफल कितना है? (वर्ग मीटर या वर्ग फुट में, जैसे 150 वर्ग मीटर)",
           "road_width": "आपके प्लॉट के सामने की सड़क कितनी चौड़ी है? (मीटर में, जैसे 9)",
           "building_height": "इमारत की प्रस्तावित ऊँचाई कितनी होगी? (मीटर में, जैसे 9)"},
}
STATUS = {
    "en": {"supported": "Quoted from the official rule text (to 6 March 2025); no human review yet.",
           "conditional": "Applies only under the assumptions stated.",
           "pending_verification": "Pointer to the rule text — not yet verified by a human reviewer.",
           "insufficient_information": "More information is needed.",
           "source_conflict": "Sources disagree — check the official gazette.",
           "not_established": "Not found in the supplied rules."},
    "hi": {"supported": "आधिकारिक नियम-पाठ (6 मार्च 2025 तक) से उद्धृत; अभी मानव-समीक्षा नहीं हुई।",
           "conditional": "केवल बताई गई मान्यताओं में लागू।",
           "pending_verification": "नियम-पाठ की ओर संकेत — अभी किसी व्यक्ति ने इसकी पुष्टि नहीं की है।",
           "insufficient_information": "और जानकारी चाहिए।",
           "source_conflict": "स्रोतों में विरोध है — आधिकारिक राजपत्र देखें।",
           "not_established": "दिए गए नियमों में इसका उत्तर नहीं मिला।"},
}
T = {
    "en": {
        "greeting": ("*Rule Dost* — an AI assistant for the Madhya Pradesh Bhumi Vikas Rules, 2012.\n"
                     "I am not a government official and I cannot approve anything: the municipal officer decides.\n\n"
                     "Ask in Hindi, English or Hinglish, by text or voice note. For example:\n"
                     "• “10 m road, 9 m tall house — front open space?”\n• “Rule 26-B”\n• “authority did not reply, what happens?”\n\n"
                     "Send STOP to stop messages."),
        "related": "Rules related to your question:",
        "understood": "What I understood from you:",
        "quote_note": "Rule text is quoted exactly as written (in English); it is not translated.",
        "page": "PDF page {p}", "pages": "PDF pages {a}–{b}", "page_range": "(rule-level page range, exact page not located)",
        "table": "⚠ Contains a flattened table — check the figures on the official PDF page.",
        "ask_more": "To narrow this down:",
        "assumed": "(I assumed {u}.)",
        "explain": "*Simple explanation (AI-generated, checked against the cited rules):*",
        "disclaimer": "This is not an official decision. The municipal officer decides.",
        "abstain": ("I could not find this in the rules I have (Madhya Pradesh Bhumi Vikas Rules, 2012, consolidated to 6 March 2025). "
                    "I will not guess. Please ask the officer at the municipal counter."),
        "abstain_tip": "You can ask about fees, documents, open spaces, height, parking, validity or deadlines, or send a rule number.",
        "thanks": "You're welcome. Ask anything else about the building rules.",
        "optout": "You will not receive further messages. Send START to resume.",
        "optin": "Welcome back. Ask your question about the building rules.",
        "empty": "I did not receive any text. Please type your question or send a clear voice note.",
        "too_long": "That message is too long for me. Please ask one question in a few lines.",
        "no_data": "The rule data is not available on the server right now. Please try again later or ask at the municipal counter.",
        "error": "Sorry, something went wrong on my side. Please try again in a minute or ask at the municipal counter.",
        "unsupported": ("I can read text and voice notes only. I cannot read or check photos or documents, and I do not keep them. "
                        "Please type your question."),
        "voice_echo": "🎙 I heard: “{t}”",
        "voice_fail": "I could not understand the voice note. Please send it again clearly, or type your question.",
        "voice_off": "Voice notes are not enabled on this service yet. Please type your question.",
        "throttle": "You are sending messages very quickly. Please wait a minute and try again.",
    },
    "hi": {
        "greeting": ("*रूल दोस्त* — मध्य प्रदेश भूमि विकास नियम, 2012 के लिए एक AI सहायक।\n"
                     "मैं सरकारी अधिकारी नहीं हूँ और कोई अनुमति नहीं दे सकता: अंतिम निर्णय नगर निगम अधिकारी का होता है।\n\n"
                     "हिंदी, अंग्रेज़ी या हिंग्लिश में, टेक्स्ट या वॉइस नोट से पूछें। जैसे:\n"
                     "• “10 मीटर सड़क, 9 मीटर ऊँचा मकान — सामने कितनी जगह छोड़ें?”\n• “Rule 26-B”\n"
                     "• “अधिकारी ने जवाब नहीं दिया तो क्या होगा?”\n\nसंदेश बंद करने के लिए STOP भेजें।"),
        "related": "आपके प्रश्न से जुड़े नियम:",
        "understood": "आपकी बात से मैंने यह समझा:",
        "quote_note": "नियम का पाठ जस का तस (अंग्रेज़ी में) उद्धृत है; अनुवाद नहीं किया गया है।",
        "page": "PDF पृष्ठ {p}", "pages": "PDF पृष्ठ {a}–{b}", "page_range": "(नियम-स्तर का पृष्ठ-विस्तार, सटीक पृष्ठ नहीं मिला)",
        "table": "⚠ इसमें समतल की गई तालिका है — आँकड़े आधिकारिक PDF पृष्ठ पर जाँच लें।",
        "ask_more": "बात साफ़ करने के लिए:",
        "assumed": "(मैंने {u} मान लिया।)",
        "explain": "*सरल व्याख्या (AI द्वारा बनाई गई, उद्धृत नियमों से जाँची गई):*",
        "disclaimer": "यह आधिकारिक निर्णय नहीं है। अंतिम निर्णय नगर निगम अधिकारी का है।",
        "abstain": ("यह मुझे अपने पास के नियमों (मध्य प्रदेश भूमि विकास नियम, 2012, 6 मार्च 2025 तक) में नहीं मिला। "
                    "मैं अंदाज़ा नहीं लगाऊँगा। कृपया नगर निगम काउंटर पर अधिकारी से पूछें।"),
        "abstain_tip": "आप फीस, दस्तावेज़, खुली जगह, ऊँचाई, पार्किंग, वैधता, समय-सीमा के बारे में पूछ सकते हैं, या नियम का नंबर भेज सकते हैं।",
        "thanks": "आपका स्वागत है। भवन नियमों के बारे में और कुछ पूछना हो तो पूछें।",
        "optout": "अब आपको कोई संदेश नहीं भेजा जाएगा। दोबारा शुरू करने के लिए START भेजें।",
        "optin": "फिर से स्वागत है। भवन नियमों के बारे में अपना प्रश्न पूछें।",
        "empty": "मुझे कोई टेक्स्ट नहीं मिला। कृपया अपना प्रश्न लिखें या साफ़ वॉइस नोट भेजें।",
        "too_long": "यह संदेश मेरे लिए बहुत लंबा है। कृपया कुछ पंक्तियों में एक प्रश्न पूछें।",
        "no_data": "सर्वर पर अभी नियमों का डेटा उपलब्ध नहीं है। कृपया बाद में कोशिश करें या नगर निगम काउंटर पर पूछें।",
        "error": "क्षमा करें, मेरी ओर से कुछ गड़बड़ हो गई। कृपया एक मिनट बाद फिर कोशिश करें या नगर निगम काउंटर पर पूछें।",
        "unsupported": ("मैं केवल टेक्स्ट और वॉइस नोट पढ़ सकता हूँ। फ़ोटो या दस्तावेज़ मैं न पढ़ता हूँ, न जाँचता हूँ और न सहेजता हूँ। "
                        "कृपया अपना प्रश्न लिखें।"),
        "voice_echo": "🎙 मैंने सुना: “{t}”",
        "voice_fail": "मैं वॉइस नोट समझ नहीं पाया। कृपया साफ़ आवाज़ में दोबारा भेजें या प्रश्न लिखें।",
        "voice_off": "इस सेवा पर वॉइस नोट अभी चालू नहीं हैं। कृपया अपना प्रश्न लिखें।",
        "throttle": "आप बहुत तेज़ी से संदेश भेज रहे हैं। कृपया एक मिनट रुककर फिर कोशिश करें।",
    },
}


def page_label(c: Citation, lang: str) -> str:
    t = T[lang]
    label = t["page"].format(p=c.page_start) if c.page_start == c.page_end else t["pages"].format(a=c.page_start, b=c.page_end)
    return label if c.page_exact else f"{label} {t['page_range']}"


def facts_line(a: ChannelAnswer) -> str | None:
    labels, units = FACT_LABEL[a.language], UNIT_LABEL[a.language]
    bits = []
    for f in a.facts:
        if f["name"] in labels and f["validation_status"] == "valid":
            unit = f" {units.get(f['unit'] or '', f['unit'] or '')}" if f.get("unit") else ""
            bits.append(f"{labels[f['name']]}: {f['value']}{unit}")
    return "; ".join(bits) or None


def _citation_block(c: Citation, lang: str, quote_chars: int | None = None) -> str:
    quote = c.quote if quote_chars is None or len(c.quote) <= quote_chars else c.quote[:quote_chars].rsplit(" ", 1)[0]
    ell = "…" if (c.truncated or quote != c.quote) else ""
    quote = re.sub(r"[ \t]+", " ", re.sub(r"\n\s*", "\n", quote.strip()))
    head = f"*{'नियम' if lang == 'hi' else 'Rule'} {c.rule_number} — {c.rule_title}*\n{page_label(c, lang)}"
    block = f"{head}\n“{quote}{ell}”"
    if c.table_like:
        block += f"\n{T[lang]['table']}"
    return block


def render_whatsapp(a: ChannelAnswer) -> list[str]:
    """One message normally; an exact rule lookup may be split into parts that each fit WhatsApp's limit."""
    t, lang = T[a.language], a.language
    simple = {"greeting": "greeting", "thanks": "thanks", "optout": "optout", "optin": "optin", "empty": "empty", "too_long": "too_long",
              "no_data": "no_data", "error": "error"}
    if a.kind == "silent":
        return []
    if a.kind in simple:
        head = f"{t['voice_echo'].format(t=a.echo)}\n\n" if a.echo else ""
        if a.kind == "greeting":
            other = T["en" if lang == "hi" else "hi"]["greeting"]   # greet in both languages: the language is not known yet
            return [head + t["greeting"] + "\n\n— — —\n\n" + other]
        return [head + t[simple[a.kind]]]
    if a.kind == "abstain":
        parts = [t["abstain"], t["abstain_tip"], f"ℹ️ {t['disclaimer']}"]
        return [(f"{t['voice_echo'].format(t=a.echo)}\n\n" if a.echo else "") + f"*{NAME[lang]}*\n" + "\n\n".join(parts)]

    # answer
    lines: list[str] = []
    if a.echo:
        lines.append(t["voice_echo"].format(t=a.echo))
    lines.append(f"*{NAME[lang]}* · AI")
    if a.status:
        lines.append(f"*{'स्थिति' if lang == 'hi' else 'Status'}:* {STATUS[lang].get(a.status, a.status)}")
    fl = facts_line(a)
    if fl:
        lines.append(f"{t['understood']} {fl}" + (f" {t['assumed'].format(u=UNIT_LABEL[lang].get(a.assumed_unit, a.assumed_unit))}" if a.assumed_unit else ""))
    direct = a.direct
    if direct:
        lines.append("")
        lines.append(f"*{direct['headline']}*")
        lines.extend(direct["lines"])
        lines.extend(f"⚠ {c}" for c in direct["caveats"])
        lines.append("")
    lines.append(t["related"])
    budget = max(500, (WA_MAX - 900) // max(1, len(a.citations)))
    blocks = [_citation_block(c, lang, budget) for c in a.citations]
    footer = [t["quote_note"]]
    if a.explanation:
        footer.append(f"{t['explain']}\n{a.explanation}")
    if a.follow_up:
        footer.append(f"❓ {t['ask_more']} {FOLLOW_UP[lang][a.follow_up]}")
    footer.append(f"ℹ️ {t['disclaimer']}")
    msg = "\n\n".join(["\n".join(lines), *blocks, "\n".join(footer[:-1]) if len(footer) > 1 else "", footer[-1]]).replace("\n\n\n", "\n\n")
    return [msg[:WA_MAX]]

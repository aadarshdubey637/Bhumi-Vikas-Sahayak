"""Nirmaan Helpline: the phone dialogue, independent of the telephony provider.

``VoiceDialogue.turn`` turns what the caller said into a ``VoiceReply`` (what to say, whether to listen again, whether to hang up).
``to_twiml`` renders a reply for Twilio. Twilio's ``<Gather input="speech">`` does the speech recognition and ``<Say>`` the speech
synthesis, so no separate STT/TTS vendor is needed for calls. The assistant always says it is an AI, never claims to be an official,
and never gives approvals: the legal content is the same cited rule text as every other channel.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from urllib.parse import urlencode

from app.channels.answering import ChannelAnswer, Citation

MAX_TURNS = 8
MAX_MISSES = 3         # silent / unintelligible turns in a row before we end the call politely
MIN_CONFIDENCE = 0.45   # below this the recogniser is guessing: ask again instead of answering a misheard question
MAX_SPOKEN_QUOTE = 260
LANGS = {"hi-IN": "hi", "en-IN": "en"}
HINTS = "नियम, मकान, प्लॉट, सड़क, खुली जगह, ऊँचाई, पार्किंग, फीस, setback, FAR, permission, rule, lift, balcony"

# Spoken Hindi names for the digits of a rule number would be awkward; numbers are read as digits by the TTS engine.
S = {
    "hi": {
        "greet": ("नमस्ते। आप निर्माण हेल्पलाइन पर हैं। मैं एक AI सहायक हूँ, सरकारी अधिकारी नहीं। मैं मध्य प्रदेश भूमि विकास नियमों के बारे में "
                  "जानकारी दे सकती हूँ, लेकिन मेरा जवाब कोई सरकारी अनुमति या निर्णय नहीं है; अंतिम फ़ैसला नगर निगम अधिकारी का होता है। "
                  "अपना प्रश्न बोलिए। अंग्रेज़ी के लिए दो दबाइए।"),
        "greet_en": "For English, press 2.",
        "listen_more": "आप कोई और प्रश्न पूछ सकते हैं। लिखित जानकारी के लिए एक दबाइए। बंद करने के लिए तीन दबाइए।",
        "silence1": "मुझे कुछ सुनाई नहीं दिया। कृपया अपना प्रश्न बोलिए।",
        "silence2": "अब भी कुछ सुनाई नहीं दिया। कृपया एक बार फिर बोलिए।",
        "unclear": "मैं आपकी बात ठीक से समझ नहीं पाई। कृपया थोड़ा धीरे और साफ़ बोलिए।",
        "bye_silent": "आवाज़ नहीं आ रही है, इसलिए मैं कॉल समाप्त कर रही हूँ। आप दोबारा कॉल कर सकते हैं या नगर निगम काउंटर पर पूछ सकते हैं। धन्यवाद।",
        "bye": "धन्यवाद। यह एक AI सहायक की जानकारी थी, आधिकारिक निर्णय नहीं। अंतिम फ़ैसला नगर निगम अधिकारी का है। नमस्ते।",
        "bye_limit": "बातचीत बहुत लंबी हो गई है, इसलिए मैं कॉल समाप्त कर रही हूँ। कृपया नगर निगम काउंटर पर अधिकारी से मिलें। धन्यवाद।",
        "abstain": ("मुझे उपलब्ध नियमों में इसका उत्तर नहीं मिला, और मैं अंदाज़ा नहीं लगाऊँगी। कृपया नगर निगम काउंटर पर अधिकारी से पूछें। "
                    "क्या आप कोई और प्रश्न पूछना चाहेंगे?"),
        "rule_intro": "आपके प्रश्न से जुड़ा नियम है:", "rule": "नियम {n}, {t}, PDF पृष्ठ {p}।", "rule_more": "इसके अलावा नियम {n}, PDF पृष्ठ {p}।",
        "pending": "यह अभी किसी व्यक्ति द्वारा सत्यापित नहीं है, इसलिए इसे अंतिम उत्तर न मानें।",
        "text_in_english": "नियम का पाठ अंग्रेज़ी में है; लिखित रूप में भेजने के लिए एक दबाइए।",
        "error": ("क्षमा करें, तकनीकी समस्या आ गई है। कृपया थोड़ी देर बाद फिर कॉल करें या नगर निगम काउंटर पर पूछें। "
                  "मैं कोई अंदाज़ा नहीं लगाऊँगी। धन्यवाद।"),
        "send_ok": "ठीक है, मैंने लिखित जानकारी आपके नंबर पर भेज दी है। ", "send_none": "अभी इस लाइन पर लिखित जानकारी भेजना चालू नहीं है। ",
        "send_fail": "मैं लिखित जानकारी भेज नहीं पाई। ", "send_nothing": "भेजने के लिए अभी कोई जवाब नहीं है। ",
        "ask_number": "कृपया केवल संख्या बोलिए, जैसे नौ।",
        "noted": "ठीक है, मैंने नोट कर लिया।",
    },
    "en": {
        "greet": ("Hello. You have reached Nirmaan Helpline. I am an AI assistant, not a government official. I can share information from "
                  "the Madhya Pradesh Bhumi Vikas Rules, but what I say is not an official approval or decision; the municipal officer decides. "
                  "Please ask your question."),
        "greet_en": "",
        "listen_more": "You can ask another question. Press 1 for the written details. Press 3 to end the call.",
        "silence1": "I did not hear anything. Please say your question.",
        "silence2": "I still could not hear you. Please try once more.",
        "unclear": "I could not understand that clearly. Please speak a little slower.",
        "bye_silent": "I cannot hear you, so I am ending the call. You can call again or ask at the municipal counter. Thank you.",
        "bye": "Thank you. This was information from an AI assistant, not an official decision. The municipal officer decides. Goodbye.",
        "bye_limit": "This conversation has become long, so I am ending the call. Please meet the officer at the municipal counter. Thank you.",
        "abstain": ("I could not find the answer in the rules I have, and I will not guess. Please ask the officer at the municipal counter. "
                    "Would you like to ask something else?"),
        "rule_intro": "The rule related to your question is:", "rule": "Rule {n}, {t}, PDF page {p}.", "rule_more": "Also Rule {n}, PDF page {p}.",
        "pending": "This has not yet been verified by a human reviewer, so please do not treat it as final.",
        "text_in_english": "Press 1 and I will send you the written details.",
        "error": ("Sorry, there was a technical problem. Please call again in a while or ask at the municipal counter. "
                  "I will not guess an answer. Thank you."),
        "send_ok": "Done. I have sent the written details to your number. ", "send_none": "Sending written details is not enabled on this line. ",
        "send_fail": "I could not send the written details. ", "send_nothing": "There is no answer to send yet. ",
        "ask_number": "Please say just the number, for example nine.",
        "noted": "Noted.",
    },
}
FOLLOW_UP_SPOKEN = {
    "hi": {"plot_area": "आपके प्लॉट का क्षेत्रफल कितना है? वर्ग मीटर या वर्ग फुट में बताइए।",
           "road_width": "आपके प्लॉट के सामने की सड़क कितनी चौड़ी है? मीटर में बताइए।",
           "building_height": "इमारत की ऊँचाई कितनी होगी? मीटर में बताइए।"},
    "en": {"plot_area": "What is the area of your plot, in square metres or square feet?",
           "road_width": "How wide is the road in front of your plot, in metres?",
           "building_height": "How tall will the building be, in metres?"},
}


@dataclass
class Say:
    text: str
    lang: str   # "hi-IN" | "en-IN"


@dataclass
class VoiceReply:
    say: list[Say] = field(default_factory=list)
    listen: bool = True            # play ``say`` inside <Gather> (caller may interrupt) and wait for speech/digit
    hangup: bool = False
    lang: str = "hi-IN"            # recognition language for the next turn
    next_n: int = 1
    misses: int = 0
    evidence_ids: list[str] = field(default_factory=list)   # public rule-chunk ids, carried in the signed URL for "send in writing"
    send_written: bool = False     # the caller pressed 1 (explicit consent): the service sends the written answer


def citation_speech(cites: list[Citation], lang: str) -> list[str]:
    t = S[lang]
    out: list[str] = []
    for i, c in enumerate(cites[:2]):
        page = f"{c.page_start}" if c.page_start == c.page_end else f"{c.page_start} से {c.page_end}" if lang == "hi" else f"{c.page_start} to {c.page_end}"
        out.append((t["rule"] if i == 0 else t["rule_more"]).format(n=c.rule_number, t=c.rule_title, p=page))
    return out


def quote_for_speech(c: Citation) -> str:
    q = re.sub(r"\s+", " ", c.quote).strip()
    if len(q) > MAX_SPOKEN_QUOTE:
        q = q[:MAX_SPOKEN_QUOTE].rsplit(" ", 1)[0]
    return q


def speak_answer(a: ChannelAnswer, lang_code: str) -> tuple[list[Say], list[str]]:
    """Short spoken answer: rule numbers and PDF pages, the status, ONE follow-up question, and an offer to send details in writing.
    In English the first rule's sentence is read out exactly; in Hindi the English legal text is offered in writing instead."""
    lang = LANGS[lang_code]
    t = S[lang]
    if a.kind == "abstain":
        return [Say(t["abstain"], lang_code)], []
    parts: list[Say] = []
    if a.direct:  # the stated answer first (it is already in the caller's language), then the rule numbers
        parts.append(Say(re.sub(r"\s+", " ", a.direct["headline"]), lang_code))
    parts.append(Say(t["rule_intro"], lang_code))
    parts += [Say(x, lang_code) for x in citation_speech(a.citations, lang)]
    if lang == "en" and a.citations:
        parts.append(Say("It says: " + quote_for_speech(a.citations[0]), "en-IN"))
    else:
        parts.append(Say(t["text_in_english"], lang_code))
    if a.status != "supported":
        parts.append(Say(t["pending"], lang_code))
    if a.follow_up:
        parts.append(Say(FOLLOW_UP_SPOKEN[lang][a.follow_up], lang_code))
    return parts, [c.evidence_id for c in a.citations]


def written_text(a_cites: list[Citation], lang: str) -> str:
    """The text sent after a call (SMS or WhatsApp template): rule numbers, pages and the exact sentence. No personal data."""
    lines = []
    for c in a_cites[:2]:
        pg = f"{c.page_start}" if c.page_start == c.page_end else f"{c.page_start}-{c.page_end}"
        lines.append(f"{'नियम' if lang == 'hi' else 'Rule'} {c.rule_number} ({c.rule_title}), PDF p.{pg}: “{quote_for_speech(c)}”")
    tail = "AI सहायक की जानकारी; आधिकारिक निर्णय नहीं। नगर निगम अधिकारी तय करता है।" if lang == "hi" else "From an AI assistant; not an official decision. The municipal officer decides."
    return " ".join(lines) + " " + tail


# ------------------------------------------------------------------------------------------------ TwiML
def to_twiml(r: VoiceReply, *, action_url: str, voice: str, hints: str = HINTS, timeout: int = 6) -> str:
    """Render a reply. ElementTree escapes every text node, so a caller's words can never inject markup."""
    root = ET.Element("Response")

    def add_say(parent: ET.Element, s: Say) -> None:
        el = ET.SubElement(parent, "Say", {"language": s.lang, "voice": voice})
        el.text = s.text

    if r.listen and not r.hangup:
        g = ET.SubElement(root, "Gather", {"input": "speech dtmf", "language": r.lang, "speechTimeout": "auto", "timeout": str(timeout),
                                           "numDigits": "1", "action": action_url, "method": "POST", "actionOnEmptyResult": "true",
                                           "hints": hints, "profanityFilter": "false"})
        for s in r.say:
            add_say(g, s)       # inside <Gather>: the caller may interrupt (barge-in)
        ET.SubElement(root, "Redirect", {"method": "POST"}).text = action_url   # reached if Twilio ends the Gather without calling it
    else:
        for s in r.say:
            add_say(root, s)
        if r.hangup:
            ET.SubElement(root, "Hangup")
    return '<?xml version="1.0" encoding="UTF-8"?>' + ET.tostring(root, encoding="unicode")


def action_url(base: str, path: str, r: VoiceReply) -> str:
    q = {"n": str(r.next_n), "miss": str(r.misses), "lang": r.lang}
    if r.evidence_ids:
        q["ev"] = ",".join(r.evidence_ids)
    return f"{base}{path}?{urlencode(q)}"


# ------------------------------------------------------------------------------------------------ number words
_HI_NUM = {"शून्य": 0, "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छे": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
           "ग्यारह": 11, "बारह": 12, "तेरह": 13, "चौदह": 14, "पंद्रह": 15, "सोलह": 16, "सत्रह": 17, "अठारह": 18, "उन्नीस": 19, "बीस": 20,
           "तीस": 30, "चालीस": 40, "पचास": 50, "साठ": 60, "सत्तर": 70, "अस्सी": 80, "नब्बे": 90, "सौ": 100}
_EN_NUM = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
           "twelve": 12, "fifteen": 15, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "hundred": 100,
           "nau": 9, "das": 10, "aath": 8, "saat": 7, "chhe": 6, "paanch": 5, "char": 4, "teen": 3, "do": 2, "ek": 1}


def spoken_number_to_digits(text: str) -> str:
    """Recognisers usually return digits ('9 मीटर'); when they return a number word, convert the simple ones (0-100, tens).
    Anything else is left as is, and the dialogue asks the caller to repeat."""
    def conv(tok: str) -> str:
        low = tok.lower()
        if low in _EN_NUM:
            return str(_EN_NUM[low])
        return str(_HI_NUM[tok]) if tok in _HI_NUM else tok
    return " ".join(conv(t) for t in text.split())

"""Messaging/voice channels (WhatsApp "Rule Dost", phone "Nirmaan Helpline") on top of the existing answer pipeline.

Design rule: channels only *format and transport*. Every legal statement comes from ``run_ask`` (retrieval + evidence validation +
six-status policy) and is quoted verbatim from stored rule text. Nothing here writes legal content of its own.
"""

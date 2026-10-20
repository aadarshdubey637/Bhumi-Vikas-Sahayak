"""Shared fixtures. Synthetic fixtures live ONLY under tests/fixtures and are never mixed with the legal corpus."""
from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.base import Base
from app.db.session import make_engine, make_session_factory
from app.ingestion.jsonl import ingest_jsonl
from app.main import create_app
from app.repositories import rule_repository as repo
from app.rules import registry as dep_registry
from app.rules.calculations import registry as calc_registry

BACKEND = Path(__file__).resolve().parents[1]
CORPUS = BACKEND / "data/processed/corpus_rules.jsonl"
AMENDMENTS = BACKEND / "data/pending/amendments_pending.json"
RAW_JSONL = BACKEND / "data/raw/bhumi_vikas_rules.jsonl"
RAW_FULLTEXT = BACKEND / "data/raw/bhumi_vikas_rules_fulltext_by_page.txt"
FIX = Path(__file__).parent / "fixtures"
SYN_JSONL, SYN_AMD = FIX / "synthetic_rules.jsonl", FIX / "synthetic_amendments.json"


@pytest.fixture(autouse=True)
def _clean_registries():
    calc_registry.clear()
    dep_registry.clear_dependencies()
    yield
    calc_registry.clear()
    dep_registry.clear_dependencies()


# ---- real corpus (skipped when the supplied data is absent) --------------------------------------
@pytest.fixture(scope="session")
def store():
    if not CORPUS.exists():
        pytest.skip("corpus not built: run python -m scripts.ingest_jsonl")
    from app.services.retrieval_service import RuleStore
    return RuleStore.from_files(CORPUS)


@pytest.fixture(scope="session")
def amendments():
    from app.services.version_service import load_amendments
    return load_amendments(AMENDMENTS)


# ---- synthetic DB + app ---------------------------------------------------------------------------
def _fresh_db():
    engine = make_engine("sqlite://")
    Base.metadata.create_all(engine)
    return engine, make_session_factory(engine)


@pytest.fixture
def db_engine():
    engine, _ = _fresh_db()
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(db_engine):
    return make_session_factory(db_engine)


@pytest.fixture
def synthetic_loaded(session_factory):
    """DB loaded with the SYNTHETIC rules + amendment; returns the session factory."""
    records, _ = ingest_jsonl(SYN_JSONL)
    with session_factory() as s:
        doc = repo.get_or_create_source_document(
            s, "SYN-DOC-1", title="SYNTHETIC document", document_type="rulebook", language="en", verification_status="unverified")
        repo.import_records(s, records, doc)
        repo.import_amendments(s, SYN_AMD)
        s.commit()
    return session_factory


def make_client(db_engine, extra_env: dict[str, str] | None = None, store_loaded: bool = True) -> TestClient:
    env = {"DATABASE_URL": "sqlite://", "RATE_LIMIT_PER_MINUTE": "1000", **(extra_env or {})}
    return TestClient(create_app(Settings.from_env(env), engine=db_engine))


@pytest.fixture
def client(db_engine, synthetic_loaded):
    with make_client(db_engine) as c:
        yield c


@pytest.fixture
def empty_client(db_engine):
    with make_client(db_engine) as c:
        yield c


def key_hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


@pytest.fixture
def auth_client(db_engine, synthetic_loaded):
    env = {"AUTH_MODE": "api_key", "API_KEY_HASHES": f"alice:{key_hash('key-alice')},bob:{key_hash('key-bob')}"}
    with make_client(db_engine, env) as c:
        yield c


A_HDR, B_HDR = {"X-API-Key": "key-alice"}, {"X-API-Key": "key-bob"}

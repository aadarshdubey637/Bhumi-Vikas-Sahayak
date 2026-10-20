"""Optional semantic retrieval (sentence-transformers). Disabled unless installed AND enabled.

Not exercised by the core test suite.  Lexical retrieval is the evaluated baseline; add
semantic scores only if ``scripts/evaluate_rag.py`` shows a measurable gain.
"""
from __future__ import annotations


class SemanticUnavailable(RuntimeError):
    pass


class SemanticIndex:
    def __init__(self, texts: list[str], model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"):
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
        except ImportError as e:  # pragma: no cover
            raise SemanticUnavailable("sentence-transformers is not installed") from e
        self._model = SentenceTransformer(model_name)  # pragma: no cover
        self._emb = self._model.encode(texts, normalize_embeddings=True)  # pragma: no cover

    def search(self, query: str, top_k: int = 10) -> list[tuple[int, float]]:  # pragma: no cover
        import numpy as np  # type: ignore

        q = self._model.encode([query], normalize_embeddings=True)[0]
        sims = self._emb @ q
        order = np.argsort(-sims)[:top_k]
        return [(int(i), float(sims[i])) for i in order]

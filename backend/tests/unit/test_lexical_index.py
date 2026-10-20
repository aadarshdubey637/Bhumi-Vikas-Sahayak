from app.rag.lexical_index import BM25Index, stem, tokenize


def test_tokenize_drops_stopwords_and_stems():
    assert tokenize("The fees are 5 metres") == ["fee", "5", "metre"]
    assert tokenize("the", keep_stopwords=True) == ["the"]


def test_stem_edge_cases():
    assert stem("ies") == "ies" and stem("parties") == "party" and stem("glass") == "glass"


def make():
    return BM25Index([tokenize(t) for t in ["front open space road", "parking lift stair", "fee permission application"]])


def test_ranking_and_ties_are_deterministic():
    idx = make()
    assert idx.search(tokenize("parking"))[0][0] == 1
    assert idx.search(tokenize("zzz")) == []
    assert idx.search([]) == []


def test_predicate_filters():
    idx = make()
    assert idx.search(tokenize("parking fee"), predicate=lambda i: i != 1)[0][0] == 2


def test_coverage():
    idx = make()
    assert idx.coverage(["front", "road"], 0) == 1.0
    assert idx.coverage(["front", "lift"], 0) == 0.5
    assert idx.coverage([], 0) == 0.0


def test_empty_index():
    assert BM25Index([]).search(["a"]) == []

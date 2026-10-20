"""One-off: merge the Workbench (wb.*) strings into en.json and hi.json. Hindi strings need native-speaker review."""
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent / "src" / "i18n"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from wb_strings import EN, HI  # noqa: E402
from wb_strings2 import EN as EN2, HI as HI2  # noqa: E402
from wb_strings3 import EN as EN3, HI as HI3  # noqa: E402
from wb_strings4 import EN as EN4, HI as HI4  # noqa: E402
from wb_strings5 import EN as EN5, HI as HI5  # noqa: E402
from wb_strings6 import EN as EN6, HI as HI6  # noqa: E402
from wb_strings7 import EN as EN7, HI as HI7  # noqa: E402

EN = {**EN, **EN2, **EN3, **EN4, **EN5, **EN6, **EN7}
HI = {**HI, **HI2, **HI3, **HI4, **HI5, **HI6, **HI7}

assert set(EN) == set(HI), set(EN) ^ set(HI)


def merge(path: Path, flat: dict) -> None:
    d = json.loads(path.read_text(encoding="utf-8"))
    for k, v in flat.items():
        parts = k.split(".")
        cur = d
        for p in parts[:-1]:
            cur = cur.setdefault(p, {})
            assert isinstance(cur, dict), k
        cur[parts[-1]] = v
    path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


merge(BASE / "en.json", EN)
merge(BASE / "hi.json", HI)
print(len(EN), "keys merged")

"""Rule-dependency registry: which calculations/conclusions depend on which rules.

Ships empty.  A dependency may be added only after it has been established and verified
(docs/rule_verification.md).  Amendment impact analysis consults ONLY this registry, so the
system never claims an amendment changes a calculation unless the dependency is recorded.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RuleDependency:
    source_rule: str  # rule key, e.g. "2"
    target: str  # rule key or formula_id
    dependency_type: str  # applicability_condition | calculation_input | table_lookup
    description: str
    verification_status: str  # only "verified" dependencies are used


_DEPENDENCIES: list[RuleDependency] = []


def add_dependency(dep: RuleDependency) -> None:
    _DEPENDENCIES.append(dep)


def clear_dependencies() -> None:
    _DEPENDENCIES.clear()


def dependencies_for(rule_key: str) -> list[RuleDependency]:
    return [d for d in _DEPENDENCIES if d.source_rule == rule_key and d.verification_status == "verified"]

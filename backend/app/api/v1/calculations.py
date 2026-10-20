from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import DB, Store, get_principal
from app.core.exceptions import ValidationFailed
from app.repositories.rule_repository import load_amendment_dataclasses
from app.rules.calculations.base import CalculationError
from app.rules.calculations.geometry import plot_area_rectangle
from app.rules.calculations.units import canonical_unit, convert_value
from app.schemas.api import AssessRequest, AssessResponse, CalculationTrace, PlotAreaRequest, PlotPreviewRequest, PlotPreviewResponse
from app.services.assessment_service import run_assessment
from app.services.input_service import normalize_inputs
from app.services.visualization_service import plot_preview

router = APIRouter(tags=["calculations"], dependencies=[Depends(get_principal)])


def _dump(inputs) -> dict:
    return {k: (v.model_dump() if hasattr(v, "model_dump") else v) for k, v in inputs.items()}


@router.post("/calculations/plot-area", response_model=CalculationTrace,
             summary="General rectangle area (arithmetic only; not a regulatory check)")
def plot_area(body: PlotAreaRequest) -> CalculationTrace:
    try:
        l_m = convert_value(body.length.value, canonical_unit(body.length.unit)[0], "m")
        w_m = convert_value(body.width.value, canonical_unit(body.width.unit)[0], "m")
    except CalculationError as e:
        raise ValidationFailed("invalid dimension", [{"code": e.code, "msg": e.message}]) from e
    res = plot_area_rectangle(l_m, w_m, "m", body.output_unit, body.places)
    res.inputs = {"length": body.length.model_dump(), "width": body.width.model_dump()}  # echo what the caller sent
    if res.validation_status != "valid":
        raise ValidationFailed("invalid dimensions", [{"msg": w} for w in res.warnings])
    return CalculationTrace.model_validate(res.to_dict())


@router.post("/calculations/assess", response_model=AssessResponse,
             summary="Run implemented checks only; unverified requirements are reported as not_evaluated")
def assess(body: AssessRequest, db: DB, store: Store) -> AssessResponse:
    res = run_assessment(store, normalize_inputs(_dump(body.inputs)), load_amendment_dataclasses(db))
    return AssessResponse.model_validate({**res, "persisted": False})


@router.post("/plots/preview", response_model=PlotPreviewResponse,
             summary="Structured geometry + annotations for a frontend renderer (no image generated)")
def preview(body: PlotPreviewRequest, db: DB, store: Store) -> PlotPreviewResponse:
    inputs = normalize_inputs(_dump(body.inputs))
    assessment = run_assessment(store, inputs, load_amendment_dataclasses(db))
    return PlotPreviewResponse.model_validate(plot_preview(inputs, assessment))

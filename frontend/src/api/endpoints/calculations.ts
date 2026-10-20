import { request } from "../client";
import type {
  AssessRequest,
  AssessResponse,
  CalculationTrace,
  PlotAreaRequest,
  PlotPreviewRequest,
  PlotPreviewResponse,
} from "../types";

export const calculatePlotArea = (body: PlotAreaRequest) =>
  request<CalculationTrace>("POST", "/calculations/plot-area", { body });
export const assessInputs = (body: AssessRequest, signal?: AbortSignal) =>
  request<AssessResponse>("POST", "/calculations/assess", { body, signal });
export const previewPlot = (body: PlotPreviewRequest, signal?: AbortSignal) =>
  request<PlotPreviewResponse>("POST", "/plots/preview", { body, signal });

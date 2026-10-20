from fastapi import APIRouter

from app.api.v1 import assessments, auth, calculations, channels, chat, feedback, health, projects, reports, rules

api_router = APIRouter(prefix="/api/v1")
for module in (health, auth, chat, rules, projects, assessments, calculations, reports, feedback, channels):
    api_router.include_router(module.router)

from pydantic import BaseModel, Field


class ScenarioIn(BaseModel):
    name: str = "normal"
    intensity: float = Field(1.0, ge=0.0, le=1.0)


class RejectIn(BaseModel):
    reason: str = Field(..., pattern="^(donor_cannot_spare|road_closed|other)$")


class EntryIn(BaseModel):
    facility_id: str
    commodity_id: str
    quantity: float = Field(..., ge=0)
    channel: str = "web"
    note: str | None = None

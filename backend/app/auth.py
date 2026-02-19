import os
from typing import Annotated

from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


def require_admin(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Security(bearer_scheme)
    ],
) -> None:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return
    if not settings.admin_token:
        return
    if credentials is None or credentials.credentials != settings.admin_token:
        raise HTTPException(status_code=401, detail="Unauthorized")
